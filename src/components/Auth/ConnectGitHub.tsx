import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Github, LogOut, Settings } from "lucide-react";

import {
  ContextMenu,
  openContextMenu,
} from "@/components/ContextMenu/ContextMenu";
import { confirm, prompt } from "@/components/Dialog/DialogHost";
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

  const ensureClientId = async (): Promise<boolean> => {
    if (github.has_client_id) return true;
    return promptForClientId();
  };

  /// Opens a dialog asking for the GitHub OAuth App client_id, persists it,
  /// refreshes status. Returns true if the user provided a value.
  const promptForClientId = async (): Promise<boolean> => {
    const current = await api.getGithubClientId().catch(() => null);
    const res = await prompt({
      title: "GitHub OAuth App client_id",
      body: (
        <span>
          Register an OAuth App at{" "}
          <button
            type="button"
            className="text-blue-400 underline hover:text-blue-300"
            onClick={() =>
              void openUrl("https://github.com/settings/developers")
            }
          >
            github.com/settings/developers
          </button>{" "}
          with <strong>Device Flow</strong> enabled, then paste its client_id
          here. It's saved to <code>~/.config/sourceflow/state.json</code> and
          survives restarts.
        </span>
      ),
      fields: [
        {
          id: "id",
          label: "client_id",
          placeholder: "Iv1.xxxxxxxxxxxxxxxx",
          defaultValue: current ?? "",
          required: true,
        },
      ],
      confirmLabel: "Save",
    });
    if (!res) return false;
    const id = (res.id ?? "").trim();
    if (!id) return false;
    await api.setGithubClientId(id);
    await reloadGithub();
    return true;
  };

  const connect = async () => {
    if (!(await ensureClientId())) return;
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

  const clearClientId = async () => {
    const ok = await confirm({
      title: "Clear stored client_id?",
      body: (
        <span>
          You'll need to paste it again next time you want to connect to
          GitHub. Your access token (if any) is also cleared.
        </span>
      ),
      confirmLabel: "Clear",
      danger: true,
    });
    if (!ok) return;
    await api.setGithubClientId(null);
    await api.githubLogout().catch(() => undefined);
    await reloadGithub();
  };

  const connectedMenu = () => [
    {
      label: "Change client_id…",
      icon: <Settings size={12} />,
      onClick: () => void promptForClientId(),
    },
    { type: "separator" as const },
    {
      label: "Sign out",
      icon: <LogOut size={12} />,
      onClick: () => void logout(),
    },
    {
      label: "Clear client_id and sign out",
      danger: true,
      onClick: () => void clearClientId(),
    },
  ];

  if (github.connected) {
    return (
      <ContextMenu items={connectedMenu}>
        <button
          onClick={() => void logout()}
          className="flex items-center gap-2 rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          title={`Signed in as @${github.login}\nClick to sign out · Right-click for options`}
        >
          <Github size={14} />
          <span>@{github.login}</span>
          <LogOut size={12} className="text-zinc-500" />
        </button>
      </ContextMenu>
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

  // Not connected and no client_id - one-click to start setup.
  if (!github.has_client_id) {
    return (
      <button
        onClick={() =>
          void promptForClientId().then((ok) => {
            if (ok) void connect();
          })
        }
        className="flex items-center gap-2 rounded border border-amber-700/60 bg-amber-900/30 px-2 py-1 text-xs text-amber-200 hover:bg-amber-900/50"
        title="GitHub OAuth client_id not set yet"
      >
        <Github size={14} />
        Set up GitHub…
      </button>
    );
  }

  // Have client_id, just not connected (token missing or expired).
  return (
    <button
      onClick={() => void connect()}
      onContextMenu={(e) =>
        openContextMenu(e, [
          {
            label: "Change client_id…",
            icon: <Settings size={12} />,
            onClick: () => void promptForClientId(),
          },
        ])
      }
      disabled={busy}
      className="flex items-center gap-2 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-60"
    >
      <Github size={14} />
      {busy ? "Waiting for GitHub..." : "Connect GitHub"}
    </button>
  );
}
