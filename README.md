# Obr

Obr is a local-first web companion for an Obsidian vault. It gives you a fast
browser interface for capturing daily notes, editing Markdown blocks, reading
and searching notes, managing todos, and uploading images, while keeping your
content as plain Markdown files in the vault you already use.

Obr runs on your own machine and can be opened locally or exposed to trusted
devices through a stable HTTPS origin such as Tailscale Serve/Funnel. It is
built for personal writing workflows where the browser is the quick input
surface and Obsidian remains the durable knowledge base.

## Setup

Install Rust stable, then clone and build:

```bash
cargo build --release
```

For the fastest setup, let Obr generate `config/local.toml`, prepare the vault
directory, start the daemon, and print the service URL:

```bash
./target/release/obr init --vault /path/to/obsidian/vault
```

To also publish Obr through Tailscale Funnel:

```bash
./target/release/obr init --vault /path/to/obsidian/vault --tailscale
```

The Tailscale flow starts a separate userspace `tailscaled` under
`$HOME/.local/share/tailscale-obr`, asks you to approve the Tailscale login URL
if needed, enables Funnel, writes the resulting `*.ts.net` hostname into
`config/local.toml`, starts Obr, and prints both the local and public URLs. Use
`--hostname <name>` to request a specific Tailscale node name; the actual
published hostname is read back from `tailscale funnel status`.

If `config/local.toml` already exists, `obr init` backs it up before writing the
new config.

For manual setup, create a local config:

```bash
cp config.example.toml config/local.toml
```

Point `vault_path` at your Obsidian vault. You can either edit `config/local.toml` directly:

```toml
vault_path = "/path/to/obsidian/vault"
```

or keep the default `vault_path = "vault"` and create a symlink:

```bash
ln -s /path/to/obsidian/vault vault
```

To try Obr without touching a real vault, copy the demo vault:

```bash
cp -R examples/vault vault
```

Before running Obr, generate a password hash and add it to `config/local.toml`
as shown in the Password section below.

## Vault Layout

Obr keeps vault-specific paths configurable so it can fit different Obsidian layouts:

```toml
# Daily memo files are created as <daily_dir>/<YYYY-MM-DD>.md.
daily_dir = "Daily"

# Named quick-entry pages are created under this directory, for example
# page = "project/foo" writes <entry_dir>/project/foo.md.
entry_dir = "Posts"

# Uploaded images are stored here and served through /images/* and /image-preview/*.
image_dir = "Pics"

# The Todo view and page = "todo" entries use this file.
todo_path = "Posts/todo.md"
```

These vault layout paths are relative to `vault_path`. Parent path components such as `..` are rejected.

Runtime cache data is separate from the vault and is written under the gitignored `data` directory in the process working directory.

## RSS Reader

Obr can maintain a local RSS reading list. Enable it in `config/local.toml`:

```toml
rss_enabled = true
rss_feeds_path = "Zero/feeds.md"
rss_data_dir = "data/rss"
rss_refresh_minutes = 30
rss_max_items_per_feed = 20
rss_fetch_full_content = true
```

`rss_feeds_path` is relative to `vault_path` and should contain one RSS, Atom,
or JSON Feed URL per line. Blank lines and `#` comments are ignored, and
duplicate URLs are skipped.

RSS metadata and read/unread state are stored in `data/rss/rss.sqlite`. Article
Markdown is stored under `data/rss/content/`. When
`rss_fetch_full_content = true`, Obr fetches article pages and uses
`rs-trafilatura` to extract readable Markdown. If extraction fails, it falls
back to feed content or summary. Each refresh treats the feeds file as the
source of truth: removing a feed URL from the file removes that feed's stored
items and article Markdown on the next scan. The RSS detail page also has an
Unsubscribe action, which removes the feed URL from `rss_feeds_path` and prunes
that feed's cached items immediately.

## Security Model

Obr is designed as a local-first personal app. It can be exposed to a phone or a
remote browser, but vault content, uploaded images, page drafts, cached pages,
passkeys, logs, and sync outbox data should all be treated as sensitive local
data.

Keep these paths out of Git history:

```text
config/local.toml
vault
data
logs
cache
```

When Obr is reachable outside the local machine, serve it through HTTPS, set
`secure_cookies = true`, and configure a stable `webauthn_rp_id`. Obr derives
the WebAuthn origin as `https://<webauthn_rp_id>` unless `webauthn_origin` is
set explicitly. Obr validates request `Host` headers and rejects browser
cross-site write requests with untrusted `Origin` or `Sec-Fetch-Site` headers.
Avoid exposing Obr directly to the public internet without an additional
trusted access-control layer.

## Password

Generate an Argon2 password hash:

```bash
./target/release/obr hash-password
```

The command prompts for the password twice without echoing it, then prints a line you can put in `config/local.toml`:

```toml
username = "admin"
password_hash = "$argon2id$..."
allow_plaintext_password = false
```

For scripts, stdin still works:

```bash
printf '%s' "$OBR_PASSWORD" | ./target/release/obr hash-password
```

Plaintext passwords are disabled by default. Only enable `allow_plaintext_password = true` for throwaway local development.

## Run Locally

For local development:

```bash
cargo run
```

For the release binary:

```bash
./target/release/obr run
```

The release binary embeds the web UI assets (`index.html`, JavaScript, CSS, service worker, manifest, and favicon). Deploying Obr does not require copying the repo `assets/` directory.

Check a deployment before opening it in a browser:

```bash
./target/release/obr doctor
```

`obr check` is an alias. The doctor command validates config, vault access,
WebAuthn origin/RP ID settings, writable runtime data, logs, passkey storage,
and image directories.

Open:

```text
http://localhost:8010/
```

For local passkey testing, use `http://localhost:8010`, not `http://127.0.0.1:8010`, because the default WebAuthn origin uses `localhost`.

## Daemon Mode

Run from the repo root so relative paths in `config/local.toml` resolve correctly:

```bash
./target/release/obr daemon start
```

`obr daemon` is an alias for `obr daemon start`.

Logs are written to the configured path:

```toml
log_path = "logs/obr.log"
```

Manage the background process with:

```bash
./target/release/obr daemon status
./target/release/obr daemon reload
./target/release/obr daemon stop
```

Daemon mode writes its pid file under the gitignored `data` directory.

## Passkeys And HTTPS

For local testing, the default passkey settings are enough:

```toml
listen = "127.0.0.1:8010"
```

For phone or remote browser use, configure a stable HTTPS origin:

```toml
secure_cookies = true
webauthn_rp_id = "obr.example.com"
```

`webauthn_origin` defaults to `https://<webauthn_rp_id>`. Set it explicitly
only when the browser origin differs from that default.

Changing `webauthn_rp_id` or the effective WebAuthn origin invalidates existing
passkeys for that domain. Register a new passkey after changing the public
domain.

Once a passkey is registered, password login is disabled outside localhost. Localhost password login remains available as a recovery path.

## Tailscale Funnel

Tailscale Funnel exposes a local Obr server through a public HTTPS hostname
under your tailnet domain, such as `<hostname>.<tailnet>.ts.net`.

First, please [install tailscale](https://tailscale.com/docs/install). The
init/manual flow will ask you to log in to your tailnet if this userspace
instance has not been authorized yet.

The `init` command can run this whole flow for you:

```bash
./target/release/obr init --vault /path/to/obsidian/vault --tailscale
```

The examples below use a separate userspace `tailscaled` instance instead of the
system Tailscale daemon. That keeps Obr's public route isolated in its own state
directory and socket.

```bash
HOST=ob
BASE="$HOME/.local/share/tailscale-obr"
SOCK="$BASE/tailscaled.sock"
```

Start the separate `tailscaled` in the background:

```bash
mkdir -p "$BASE"

nohup tailscaled \
  --tun=userspace-networking \
  --socket="$SOCK" \
  --statedir="$BASE" \
  > "$BASE/tailscaled.log" 2>&1 &

echo $! > "$BASE/tailscaled.pid"
```

Log this instance into your tailnet and choose the `*.ts.net` hostname:

```bash
tailscale --socket="$SOCK" up --hostname="$HOST" --accept-dns=false
```

If this is the first login for this state directory, Tailscale prints an
authorization URL. Open it and approve the new node.

With Obr listening on `127.0.0.1:8010`, publish it through Funnel:

```bash
tailscale --socket="$SOCK" funnel --yes --bg http://127.0.0.1:8010
```

Check the public route:

```bash
tailscale --socket="$SOCK" funnel status
```

Then set the WebAuthn config to the Funnel hostname:

```toml
secure_cookies = true
webauthn_rp_id = "<hostname>.<tailnet>.ts.net"
```

Replace `<hostname>.<tailnet>.ts.net` with the HTTPS hostname from
`funnel status`. For example, if `HOST=ob`, the public origin will look like
`https://ob.<tailnet>.ts.net`.

The `--socket` flag is important. Without it, the `tailscale` CLI tries the
system daemon socket, usually `/var/run/tailscaled.socket`, and will not talk to
the separate Obr `tailscaled` instance above.

Stop the public Funnel route without stopping `tailscaled`:

```bash
tailscale --socket="$SOCK" funnel reset
```

Stop the separate `tailscaled` process:

```bash
kill "$(cat "$BASE/tailscaled.pid")"
```

`tailscaled.state` is internal state maintained by `tailscaled`. Do not edit it
by hand; change Funnel and Serve routes with the `tailscale --socket=...`
commands.

## License

Obr is licensed under the [MIT License](LICENSE).
