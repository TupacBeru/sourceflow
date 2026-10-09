# SourceFlow

A lightweight, native-feeling Git client focused on GitHub.
Built with Tauri 2 (Rust) + React + TypeScript.

Works on **Linux** (Fedora, Debian/Ubuntu, and most distros) and **macOS**.

## Why

SourceTree is excellent but doesn't run on Linux. Existing Linux Git GUIs are
either too heavy (GitKraken, GitHub Desktop via Electron) or too thin. SourceFlow
aims to be:

- Lightweight (Tauri WebView, not Electron)
- GitHub-only (simple OAuth, no SSH key juggling)
- Tokens stored in the OS keyring (KWallet / GNOME Keyring / macOS Keychain)
- A real Git workflow tool: stage, commit, branch management, merge, rebase,
  cherry-pick, revert, reset, tag, context menus everywhere

## Clone and run

```bash
git clone https://github.com/TupacBeru/sourceflow.git
cd sourceflow
```

You need **Node.js** (18+) and **Rust** (stable):

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Then install OS packages, `npm install`, and either run in dev mode or build.

### Fedora

```bash
sudo dnf install \
    webkit2gtk4.1-devel \
    openssl-devel \
    libsecret-devel \
    libappindicator-gtk3-devel \
    librsvg2-devel \
    gcc gcc-c++ \
    pkgconf-pkg-config \
    nodejs npm

npm install
npm run tauri dev          # development
# or:
npm run tauri:build        # release binary + bundles
```

Daily-driver install (RPM, app menu, pin to taskbar):

```bash
./scripts/install-rpm.sh
```

The installed command is `sourceflow`. RPM filename is `SourceFlow-…`; the
package name is `source-flow`. Quit the app before upgrading.

### Debian / Ubuntu

```bash
sudo apt-get update
sudo apt-get install -y \
    libwebkit2gtk-4.1-dev \
    libssl-dev \
    libsecret-1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    patchelf \
    pkg-config \
    build-essential \
    curl \
    nodejs npm

npm install
npm run tauri dev
# or:
npm run tauri:build
```

### macOS

```bash
xcode-select --install
# Node via https://nodejs.org or: brew install node
npm install
npm run tauri dev
# or:
npm run tauri:build
```

The first Rust build takes several minutes (libgit2). Later rebuilds are
incremental.

Release bundles land in `src-tauri/target/release/bundle/`:
Linux `.rpm` / `.deb` / `.AppImage`, macOS `.dmg`.

macOS builds are ad-hoc signed (no Apple Developer ID). After installing a
`.dmg` from the internet, right-click the app → **Open** the first time, or
allow it under System Settings → Privacy & Security.

## GitHub OAuth setup

SourceFlow uses GitHub's [Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
so it never needs a redirect URI. You provide your own OAuth App client_id
once, the first time you connect.

1. Go to <https://github.com/settings/developers> and create a **New OAuth App**.
   - Homepage URL: anything (e.g. `https://github.com/your-username`)
   - Authorization callback URL: anything (Device Flow ignores it)
2. On the resulting app page, enable **Device Flow** (toggle near the bottom).
3. Copy the **Client ID** (looks like `Iv1.xxxxxxxxxxxxxxxx` or `Ov23li…`).
4. In SourceFlow, click **Set up GitHub…** in the toolbar and paste it.

The client_id is saved to `~/.config/sourceflow/state.json` (Linux) or
`~/Library/Application Support/sourceflow/state.json` (macOS) and survives
restarts. You can change or clear it later via right-click on the GitHub
button.

The access token itself is stored in the OS keyring:
- Linux: D-Bus Secret Service (KWallet on KDE, GNOME Keyring on GNOME)
- macOS: Keychain
- Windows: Credential Manager

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
│       ├── auth/       # OAuth Device Flow + keyring
│       └── config.rs   # App config persistence
└── package.json
```

## License

MIT
