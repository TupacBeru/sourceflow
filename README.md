# SourceFlow

A lightweight, native-feeling Git client for Fedora / KDE, focused on GitHub.
Built with Tauri 2 (Rust) + React + TypeScript.

## Why

SourceTree is excellent but doesn't run on Linux. Existing Linux Git GUIs are
either too heavy (GitKraken, GitHub Desktop via Electron) or too thin. SourceFlow
aims to be:

- Lightweight (Tauri WebView, not Electron)
- GitHub-only (simple OAuth, no SSH key juggling)
- Native KDE feel: stores GitHub tokens in the OS keyring (KWallet on KDE,
  GNOME Keyring on GNOME) via the Secret Service API, so they survive reboots
- A real Git workflow tool: stage, commit, branch management, merge, rebase,
  cherry-pick, revert, reset, tag, context menus everywhere

## Status

**Phase 1** - MVP. See `PLAN.md` for the 3-phase roadmap.

Phase 1 deliverables:
- Open a single repo
- Browse commit history
- Branch sidebar (LOCAL / REMOTE / STASHES)
- Working Copy view: stage, unstage, commit
- GitHub OAuth + KWallet credential storage
- Pull / Push / Fetch toolbar

## System Requirements (Fedora KDE)

```bash
sudo dnf install \
    webkit2gtk4.1-devel \
    openssl-devel \
    libsecret-devel \
    libappindicator-gtk3-devel \
    librsvg2-devel \
    gcc gcc-c++ \
    pkgconf-pkg-config
```

## Toolchain

You need both Rust and Node.js installed:

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js (Fedora package or via nvm/fnm)
sudo dnf install nodejs npm

# Tauri CLI (installed as a project devDependency, no global install needed)
```

## Development

```bash
cd ~/Projects/sourceflow
npm install
npm run tauri dev
```

The first build of the Rust side will take several minutes as it compiles
libgit2 and other dependencies. Subsequent rebuilds are incremental.

## GitHub OAuth setup

SourceFlow uses GitHub's [Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
so it never needs a redirect URI or a local HTTP listener. You provide your own
OAuth App client_id once, the first time you connect.

1. Go to <https://github.com/settings/developers> and create a **New OAuth App**.
   - Homepage URL: anything (e.g. `https://github.com/your-username`)
   - Authorization callback URL: anything (Device Flow ignores it)
2. On the resulting app page, enable **Device Flow** (toggle near the bottom).
3. Copy the **Client ID** (looks like `Iv1.xxxxxxxxxxxxxxxx` or `Ov23li…`).
4. In SourceFlow, click **Set up GitHub…** in the toolbar and paste it.

The client_id is saved to `~/.config/sourceflow/state.json` and survives
restarts. You can change or clear it later via right-click on the GitHub
button.

The access token itself is stored in the OS keyring:
- Linux: D-Bus Secret Service (KWallet on KDE, GNOME Keyring on GNOME)
- macOS: Keychain
- Windows: Credential Manager

so it also survives reboots. (Earlier dev builds used the kernel keyutils
store which is in-memory only - hence the "click connect after every restart"
bug. That's fixed.)

## Project Layout

```
sourceflow/
├── src/                # React frontend
│   ├── components/     # UI components
│   ├── lib/            # Tauri bridge, types
│   └── store/          # Zustand state
├── src-tauri/          # Rust backend
│   └── src/
│       ├── commands/   # Tauri commands exposed to frontend
│       ├── git/        # libgit2 wrappers
│       ├── auth/       # OAuth PKCE + keyring
│       └── config.rs   # App config persistence
└── package.json
```

## License

MIT
