# TelegramGui

A native Telegram desktop client for macOS: Rust core (grammers/MTProto,
SQLx/SQLite, Tokio) with a Tauri 2 + React/TypeScript shell.

## Architecture

```
┌────────────────────────────┐
│  frontend/  React + TS     │  webview UI
└──────────────┬─────────────┘
        Tauri IPC │ commands + "core-event" stream
┌──────────────▼─────────────┐
│  crates/ui       (binary)  │  command surface, event bridge, notifications
├────────────────────────────┤
│  crates/telegram-core      │  AccountManager · sync engine · services · event bus
├─────────┬─────────┬────────┤
│ database│  cache  │telegram-api │
│ SQLx/   │ encrypted│ grammers    │
│ SQLite  │ blobs   │ (MTProto)   │
├─────────┴─────────┴────────┤
│  crates/shared             │  domain model · events · config · SecretStore trait
└────────────────────────────┘
```

Design rules:

* **Boundary** — grammers/TL wire types never leave `telegram-api`; every
  other crate speaks the `shared::model` domain language.
* **Offline-first** — SQLite is the source of truth. The sync engine writes
  network facts to the DB *before* broadcasting a `CoreEvent`; the UI only
  ever reads from the DB, so it renders instantly and works offline.
* **Event-driven** — one `tokio::broadcast` bus (`CoreEvent`) connects the
  sync engine to the UI bridge and the notification service.
* **Credentials in the Keychain** — MTProto session blobs and the media-cache
  encryption key are stored via the macOS Keychain (`keyring`), never in
  plaintext on disk. Cached media is ChaCha20-Poly1305 encrypted.

## Features

Phone-code login (incl. 2FA), QR login, multiple accounts, chat list with
pins/unread/previews, message history with pagination, sending, editing,
deleting, replies, reactions, media download (encrypted cache) and file
upload, offline full-text search (SQLite FTS5) topped up by server search,
native notifications, typing indicators, presence tracking, and background
synchronization with catch-up and reconnect backoff.

## Prerequisites

* Rust ≥ 1.85 (`rustup`), Node 20+, `pnpm`
* Telegram API credentials from <https://my.telegram.org> → *API development tools*

## Configuration

Layered TOML (later overrides earlier):

1. `config/default.toml` (repo defaults)
2. `~/Library/Application Support/TelegramGui/config.toml`
3. Environment: `TG_API_ID`, `TG_API_HASH`

```bash
export TG_API_ID=123456
export TG_API_HASH=0123456789abcdef0123456789abcdef
```

## Development

```bash
# one-time (or after any frontend change): build the webview assets
cd frontend && pnpm install && pnpm build && cd ..

# run the app — loads the built assets from frontend/dist, no dev server needed
cargo run -p ui

# tests / lints
cargo test --workspace
cargo clippy --workspace --all-targets
cd frontend && pnpm test        # tsc --noEmit
```

The Tauri config points `frontendDist` at `frontend/dist` and intentionally
sets **no** `devUrl`, so `cargo run -p ui` always serves the pre-built assets
(a debug build with a `devUrl` would otherwise show a blank window when no
Vite server is running). Rebuild the frontend (`pnpm --dir frontend build`)
after changing anything under `frontend/src`.

Want live frontend reload (HMR)? Run Vite yourself and add a matching
`devUrl` to `crates/ui/tauri.conf.json` temporarily:

```bash
pnpm --dir frontend dev      # terminal 1 → http://localhost:5173
# add "devUrl": "http://localhost:5173" to tauri.conf.json build{}, then:
cargo run -p ui              # terminal 2
```

## Feature flags

| Crate           | Flag            | Default | Effect                                  |
|-----------------|-----------------|---------|-----------------------------------------|
| `telegram-api`  | `qr-login`      | on      | raw-TL QR login flow                    |
| `telegram-core` | `qr-login`      | on      | forwards to `telegram-api/qr-login`     |
| `ui`            | `notifications` | on      | native notifications for incoming msgs  |
| `ui`            | `qr-login`      | on      | exposes the QR login command            |

`cargo build -p ui --no-default-features` produces a build without QR login
and notifications.

## Storage locations

| What                   | Where                                                    |
|------------------------|----------------------------------------------------------|
| Database (SQLite, WAL) | `~/Library/Application Support/TelegramGui/telegram_gui.db` |
| Logs (daily rolling)   | `~/Library/Application Support/TelegramGui/logs/`        |
| Encrypted media cache  | `~/Library/Caches/TelegramGui/` (LRU-bounded, 2 GiB default) |
| Sessions & cache key   | macOS Keychain, service `dev.stefan.TelegramGui`         |

## Crate map

| Crate           | Role                                                             |
|-----------------|------------------------------------------------------------------|
| `shared`        | Domain model, `CoreEvent`, config, `SecretStore` trait — no I/O  |
| `database`      | Migrations, repositories, FTS5 search, pending-send reconcile    |
| `cache`         | Keychain `SecretStore` impl + encrypted, LRU-evicted blob cache  |
| `telegram-api`  | grammers wrapper: session, auth flows, ops, update mapping       |
| `telegram-core` | `Core` façade: account runtimes, sync engine, services, bus      |
| `ui`            | Tauri shell: commands, event bridge, notifications               |
