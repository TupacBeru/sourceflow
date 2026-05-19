import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Github, LogOut } from "lucide-react";

import { api } from "@/lib/tauri";
import { useRepo } from "@/store/repoStore";

interface DeviceInfo {
  user_code: string;
  verification_uri: string;
  expires_in: number;
}

export function ConnectGitHub() {
  const github = useRepo((s) => s.github);
  const reloadGithub = useRepo((s) => s.reloadGithub);
  const setError = useRepo((s) => s.setError);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<DeviceInfo>("oauth:device_code", (evt) => {
      setDevice(evt.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      await api.startGithubOauth();
      setDevice(null);
      await reloadGithub();
    } catch (e) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String(e.message)
          : String(e);
      setError(msg);
      setDevice(null);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await api.githubLogout();
    await reloadGithub();
  };

  if (github.connected) {
    return (
      <button
        onClick={() => void logout()}
        className="flex items-center gap-2 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        title="Sign out of GitHub"
      >
        <Github size={14} />
        <span>@{github.login}</span>
        <LogOut size={12} className="text-zinc-500" />
      </button>
    );
  }

  if (device) {
    return (
      <div className="flex items-center gap-3 rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs">
        <span className="text-zinc-300">Authorize at:</span>
        <button
          onClick={() => void openUrl(device.verification_uri)}
          className="text-blue-400 underline hover:text-blue-300"
        >
          {device.verification_uri}
        </button>
        <span className="text-zinc-500">code</span>
        <code className="rounded bg-zinc-900 px-2 py-0.5 font-mono text-zinc-100">
          {device.user_code}
        </code>
      </div>
    );
  }

  return (
    <button
      onClick={() => void connect()}
      disabled={busy}
      className="flex items-center gap-2 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-60"
    >
      <Github size={14} />
      {busy ? "Waiting for GitHub..." : "Connect GitHub"}
    </button>
  );
}
