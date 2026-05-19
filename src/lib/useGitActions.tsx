/**
 * Higher-level wrappers around `api.*` ops that:
 *   - drive the global busy spinner,
 *   - pop confirm/prompt dialogs for destructive or input-requiring ops,
 *   - refresh state after success.
 *
 * Both the branch context menu (Sidebar) and the commit context menu
 * (HistoryView) consume this so they stay in sync.
 */
import { useCallback } from "react";

import { confirm, prompt } from "@/components/Dialog/DialogHost";
import { api } from "@/lib/tauri";
import type { ResetMode } from "@/lib/types";
import { useRepo } from "@/store/repoStore";

export function useGitActions(tabId: string) {
  const withBusy = useRepo((s) => s.withBusy);
  const reloadAll = useRepo((s) => s.reloadAll);

  // --- Branches ----------------------------------------------------------

  const checkoutBranch = useCallback(
    async (branchName: string) => {
      // Remote refs come in as "origin/feature-x"; the libgit2 checkout helper
      // expects the local-style name and will create the tracking branch.
      const target = branchName.includes("/")
        ? branchName.replace(/^[^/]+\//, "")
        : branchName;
      await withBusy(`Checking out ${target}...`, () =>
        api.checkoutBranch(tabId, target),
      );
      await reloadAll(tabId);
    },
    [tabId, withBusy, reloadAll],
  );

  const newBranchFrom = useCallback(
    async (startPoint: string | null, suggestedName?: string) => {
      const res = await prompt({
        title: startPoint ? "New branch from commit" : "New branch",
        fields: [
          {
            id: "name",
            label: "Branch name",
            placeholder: "feature/my-thing",
            defaultValue: suggestedName,
            required: true,
          },
        ],
        choices: [
          { id: "checkout", label: "Check out the new branch" },
          { id: "keep", label: "Stay on the current branch" },
        ],
        defaultChoice: "checkout",
        confirmLabel: "Create branch",
      });
      if (!res) return;
      const name = res.name!.trim();
      const checkout = (res.__choice ?? "checkout") === "checkout";
      await withBusy(`Creating ${name}...`, () =>
        api.createBranch(tabId, name, startPoint, checkout),
      );
      await reloadAll(tabId);
    },
    [tabId, withBusy, reloadAll],
  );

  const renameBranch = useCallback(
    async (oldName: string) => {
      const res = await prompt({
        title: `Rename branch '${oldName}'`,
        fields: [
          {
            id: "name",
            label: "New name",
            defaultValue: oldName,
            required: true,
          },
        ],
        confirmLabel: "Rename",
      });
      if (!res) return;
      const next = res.name!.trim();
      if (!next || next === oldName) return;
      await withBusy(`Renaming to ${next}...`, () =>
        api.renameBranch(tabId, oldName, next, false),
      );
      await reloadAll(tabId);
    },
    [tabId, withBusy, reloadAll],
  );

  const deleteBranch = useCallback(
    async (name: string) => {
      const ok = await confirm({
        title: `Delete branch '${name}'?`,
        body: (
          <span>
            This removes the local branch ref only - commits stay reachable from
            other refs. The currently checked-out branch cannot be deleted.
          </span>
        ),
        confirmLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      await withBusy(`Deleting ${name}...`, () =>
        api.deleteBranch(tabId, name),
      );
      await reloadAll(tabId);
    },
    [tabId, withBusy, reloadAll],
  );

  // --- Merge / Rebase / Cherry-pick / Revert -----------------------------

  const mergeBranch = useCallback(
    async (branchName: string, currentBranchLabel?: string) => {
      const ok = await confirm({
        title: `Merge '${branchName}' into ${currentBranchLabel ?? "current"}?`,
        body: (
          <span>
            Fast-forwards when possible; otherwise creates a merge commit. If
            there are conflicts the operation is aborted and the working copy is
            restored.
          </span>
        ),
        confirmLabel: "Merge",
      });
      if (!ok) return;
      await withBusy(`Merging ${branchName}...`, () =>
        api.mergeBranch(tabId, branchName),
      );
      await reloadAll(tabId);
    },
    [tabId, withBusy, reloadAll],
  );

  const rebaseOnto = useCallback(
    async (ontoName: string, currentBranchLabel?: string) => {
      const ok = await confirm({
        title: `Rebase ${currentBranchLabel ?? "current"} onto '${ontoName}'?`,
        body: (
          <span>
            Rewrites the current branch's commits on top of '{ontoName}'. If any
            commit conflicts, the rebase is aborted and the branch is restored
            to its pre-rebase state.
          </span>
        ),
        confirmLabel: "Rebase",
      });
      if (!ok) return;
      await withBusy(`Rebasing onto ${ontoName}...`, () =>
        api.rebaseOnto(tabId, ontoName),
      );
      await reloadAll(tabId);
    },
    [tabId, withBusy, reloadAll],
  );

  const cherryPick = useCallback(
    async (sha: string) => {
      const short = sha.slice(0, 7);
      const ok = await confirm({
        title: `Cherry-pick ${short}?`,
        body: (
          <span>
            Applies the changes from {short} as a new commit on the current
            branch.
          </span>
        ),
        confirmLabel: "Cherry-pick",
      });
      if (!ok) return;
      await withBusy(`Cherry-picking ${short}...`, () =>
        api.cherryPick(tabId, sha),
      );
      await reloadAll(tabId);
    },
    [tabId, withBusy, reloadAll],
  );

  const revertCommit = useCallback(
    async (sha: string) => {
      const short = sha.slice(0, 7);
      const ok = await confirm({
        title: `Revert ${short}?`,
        body: <span>Creates a new commit that undoes {short}.</span>,
        confirmLabel: "Revert",
      });
      if (!ok) return;
      await withBusy(`Reverting ${short}...`, () =>
        api.revertCommit(tabId, sha),
      );
      await reloadAll(tabId);
    },
    [tabId, withBusy, reloadAll],
  );

  // --- Reset -------------------------------------------------------------

  const resetTo = useCallback(
    async (sha: string) => {
      const short = sha.slice(0, 7);
      const res = await prompt({
        title: `Reset current branch to ${short}`,
        body: (
          <span className="text-zinc-400">
            Pick how aggressively to discard work. <strong>Hard</strong>{" "}
            permanently throws away uncommitted changes.
          </span>
        ),
        fields: [],
        choices: [
          {
            id: "soft",
            label: "Soft",
            description: "Move HEAD only; keep index and working tree.",
          },
          {
            id: "mixed",
            label: "Mixed (default)",
            description: "Move HEAD and reset index; keep working tree changes.",
          },
          {
            id: "hard",
            label: "Hard",
            description: "Move HEAD, reset index AND working tree. Destructive!",
          },
        ],
        defaultChoice: "mixed",
        confirmLabel: "Reset",
        danger: true,
      });
      if (!res) return;
      const mode = (res.__choice ?? "mixed") as ResetMode;
      await withBusy(`Resetting (${mode}) to ${short}...`, () =>
        api.resetTo(tabId, sha, mode),
      );
      await reloadAll(tabId);
    },
    [tabId, withBusy, reloadAll],
  );

  // --- Checkout commit (detached) ---------------------------------------

  const checkoutSha = useCallback(
    async (sha: string) => {
      const short = sha.slice(0, 7);
      const ok = await confirm({
        title: `Check out ${short} (detached HEAD)?`,
        body: (
          <span>
            You'll be on a detached HEAD - new commits won't belong to any
            branch unless you create one from here.
          </span>
        ),
        confirmLabel: "Check out",
      });
      if (!ok) return;
      await withBusy(`Checking out ${short}...`, () =>
        api.checkoutSha(tabId, sha),
      );
      await reloadAll(tabId);
    },
    [tabId, withBusy, reloadAll],
  );

  // --- Tag ---------------------------------------------------------------

  const createTag = useCallback(
    async (targetSha: string | null) => {
      const res = await prompt({
        title: targetSha
          ? `New tag at ${targetSha.slice(0, 7)}`
          : "New tag at HEAD",
        fields: [
          {
            id: "name",
            label: "Tag name",
            placeholder: "v1.2.3",
            required: true,
          },
          {
            id: "message",
            label: "Message (optional - leave empty for lightweight tag)",
            type: "textarea",
          },
        ],
        confirmLabel: "Create tag",
      });
      if (!res) return;
      const name = res.name!.trim();
      const message = (res.message ?? "").trim();
      await withBusy(`Tagging ${name}...`, () =>
        api.createTag(tabId, name, targetSha, message || null),
      );
      await reloadAll(tabId);
    },
    [tabId, withBusy, reloadAll],
  );

  // --- Push specific branch ---------------------------------------------

  const pushBranch = useCallback(
    async (branchName: string, hasUpstream: boolean) => {
      const remote = hasUpstream ? null : "origin";
      await withBusy(`Pushing ${branchName}...`, () =>
        api.pushBranch(tabId, branchName, remote),
      );
      await reloadAll(tabId);
    },
    [tabId, withBusy, reloadAll],
  );

  // --- Clipboard helper -------------------------------------------------

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Tauri/WebKitGTK can refuse clipboard writes if the window isn't
      // focused. Silently ignore - it's a copy action.
    }
  }, []);

  return {
    checkoutBranch,
    newBranchFrom,
    renameBranch,
    deleteBranch,
    mergeBranch,
    rebaseOnto,
    cherryPick,
    revertCommit,
    resetTo,
    checkoutSha,
    createTag,
    pushBranch,
    copy,
  };
}

export type GitActions = ReturnType<typeof useGitActions>;
