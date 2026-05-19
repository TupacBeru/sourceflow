import { useEffect } from "react";

import { useRepo } from "@/store/repoStore";

/**
 * Periodically fires `backgroundFetch` for every open tab so the ahead/behind
 * indicators reflect what's on the remote without the user pressing Fetch.
 *
 * Behaviour:
 *  - A single shared interval ticks every `TICK_MS`. On each tick we walk
 *    every tab and fetch *sequentially* (not in parallel) so that ten open
 *    tabs don't all hit GitHub at once and trip rate limits.
 *  - A tab whose previous fetch hasn't finished yet is skipped this turn
 *    (the store's `backgroundFetch` no-ops on `backgroundFetching === true`).
 *  - We also skip a tab if its last fetch is recent enough (within
 *    `MIN_GAP_MS`) - this protects against e.g. the user mashing Fetch and
 *    then the background tick firing right after.
 *  - First tick is delayed by `FIRST_DELAY_MS` so app startup isn't drowned
 *    in network calls right after the initial reloadAll.
 */
const TICK_MS = 5 * 60_000; // 5 minutes
const FIRST_DELAY_MS = 30_000; // 30 seconds after mount
const MIN_GAP_MS = 60_000; // skip if we fetched in the last minute

export function BackgroundFetcher() {
  // We deliberately don't subscribe to `tabs` here - we want this effect to
  // run exactly once and read the *current* tab list on every tick. Subscribing
  // would tear down and restart the timer every time a tab changed.
  useEffect(() => {
    let cancelled = false;

    const runRound = async () => {
      if (cancelled) return;
      const state = useRepo.getState();
      const tabs = state.tabs;
      for (const tab of tabs) {
        if (cancelled) return;
        const recent =
          tab.lastFetchedAt && Date.now() - tab.lastFetchedAt < MIN_GAP_MS;
        if (recent) continue;
        // Skip while the user is in the middle of an interactive operation,
        // so background work never competes with a Pull / Push the user just
        // clicked.
        if (state.busy) continue;
        await state.backgroundFetch(tab.id);
      }
    };

    const first = window.setTimeout(() => {
      void runRound();
    }, FIRST_DELAY_MS);
    const interval = window.setInterval(() => {
      void runRound();
    }, TICK_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
