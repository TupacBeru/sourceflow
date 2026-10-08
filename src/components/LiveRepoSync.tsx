import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { useRepo } from "@/store/repoStore";

/**
 * Keeps open repos in sync with work happening outside the app (agents,
 * terminals, other tools).
 *
 * - `repo:changed` is emitted when git metadata changes (HEAD, refs, index).
 *   That reloads history, the current branch, and ahead/behind immediately.
 * - A short poll on the active tab picks up working-tree edits, which do not
 *   touch `.git` until they are staged or committed. The poll only walks
 *   history when a ref actually moved.
 * - Focusing the window refreshes every tab, in case a burst of filesystem
 *   events was missed while the window was in the background.
 */
const POLL_MS = 2_000;

export function LiveRepoSync() {
  useEffect(() => {
    const timers = new Map<string, number>();
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const schedule = (tabId: string) => {
      const existing = timers.get(tabId);
      if (existing) window.clearTimeout(existing);
      timers.set(
        tabId,
        window.setTimeout(() => {
          timers.delete(tabId);
          if (cancelled) return;
          const state = useRepo.getState();
          if (!state.tabs.some((t) => t.id === tabId)) return;
          // Our own commands already reload, and a read mid-commit would
          // flash a half-written repo. Wait until that settles.
          if (state.busy) {
            schedule(tabId);
            return;
          }
          void state.reloadFromDisk(tabId);
        }, 200),
      );
    };

    void listen<{ tabId: string }>("repo:changed", (event) => {
      const tabId = event.payload?.tabId;
      if (tabId) schedule(tabId);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
      for (const id of timers.values()) window.clearTimeout(id);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const state = useRepo.getState();
      if (!state.activeTabId || state.busy) return;
      void state.refreshLive(state.activeTabId);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const refresh = () => {
      if (document.hidden) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        const state = useRepo.getState();
        if (state.busy) return;
        const active = state.activeTabId;
        const ids = state.tabs.map((t) => t.id);
        const ordered = active
          ? [active, ...ids.filter((id) => id !== active)]
          : ids;
        void (async () => {
          for (const tabId of ordered) {
            if (useRepo.getState().busy) return;
            await useRepo.getState().refreshLive(tabId);
          }
        })();
      }, 150);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) refresh();
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      unlisten?.();
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
