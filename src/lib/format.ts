import { formatDistanceToNowStrict } from "date-fns";

export function relativeTime(unixSeconds: number): string {
  return formatDistanceToNowStrict(new Date(unixSeconds * 1000), {
    addSuffix: true,
  });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
