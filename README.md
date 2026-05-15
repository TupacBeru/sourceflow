# SourceFlow

A lightweight, native-feeling Git client for Fedora / KDE, focused on GitHub.
Built with Tauri 2 (Rust) + React + TypeScript.

## Why

SourceTree is excellent but doesn't run on Linux. Existing Linux Git GUIs are
either too heavy (GitKraken, GitHub Desktop via Electron) or too thin. SourceFlow
aims to be:

- Lightweight (Tauri WebView, not Electron)
- GitHub-only (simple OAuth, no SSH key juggling)
- Native KDE feel (uses KWallet via the Secret Service API for credentials)
- A real Git workflow tool: stage, commit, hunk-level operations, branch management

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
