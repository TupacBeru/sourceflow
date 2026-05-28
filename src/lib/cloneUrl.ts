/** Derive a default folder name from a Git clone URL. */
export function folderNameFromUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "repository";

  let path = trimmed;
  if (path.startsWith("git@github.com:")) {
    path = path.slice("git@github.com:".length);
  } else {
    try {
      const u = new URL(path.includes("://") ? path : `https://${path}`);
      path = u.pathname;
    } catch {
      path = trimmed.split("/").pop() ?? trimmed;
    }
  }

  path = path.replace(/\/$/, "");
  const base = path.split("/").filter(Boolean).pop() ?? "repository";
  return base.replace(/\.git$/i, "") || "repository";
}
