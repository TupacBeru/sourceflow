import { ConnectGitHub } from "./Auth/ConnectGitHub";

export function TitleBar() {
  return (
    <div className="flex h-10 items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 text-sm">
      <span className="font-semibold tracking-tight text-zinc-100">
        SourceFlow
      </span>
      <ConnectGitHub />
    </div>
  );
}
