import type { BranchInfo, BranchKind } from "./types";

/** Drop the remote name prefix from a remote-tracking ref (e.g. `origin/feature/x` → `feature/x`). */
export function stripRemotePrefix(remoteBranchName: string): string {
  const slash = remoteBranchName.indexOf("/");
  if (slash === -1) return remoteBranchName;
  return remoteBranchName.slice(slash + 1);
}

/** Local-style branch name for git operations (checkout, merge, etc.). */
export function localBranchName(
  branch: Pick<BranchInfo, "name" | "kind">,
): string;
export function localBranchName(name: string, kind: BranchKind): string;
export function localBranchName(
  nameOrBranch: string | Pick<BranchInfo, "name" | "kind">,
  kind?: BranchKind,
): string {
  if (typeof nameOrBranch === "object") {
    return localBranchName(nameOrBranch.name, nameOrBranch.kind);
  }
  if (kind === "remote") return stripRemotePrefix(nameOrBranch);
  return nameOrBranch;
}
