# Obr

Obr is a small Rust web app for writing to and reading from an Obsidian vault. It is designed to run locally, then optionally be exposed through a stable HTTPS origin such as Tailscale Serve/Funnel.

## Setup

Install Rust stable, then clone and build:

```bash
cargo build --release
```

Create a local config:

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
cp -R examples/demo-vault vault
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
target
```

When Obr is reachable outside the local machine, serve it through HTTPS, set
`secure_cookies = true`, and configure a stable `webauthn_rp_id` and
`webauthn_origin`. Obr validates request `Host` headers and rejects browser
cross-site write requests with untrusted `Origin` or `Sec-Fetch-Site` headers.
Avoid exposing Obr directly to the public internet without an additional trusted
access-control layer.

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
./target/release/obr daemon
```

Logs are written to the configured path:

```toml
log_path = "logs/obr.log"
```

To stop the daemon, kill the process listening on the configured port:

```bash
lsof -tiTCP:8010 -sTCP:LISTEN | xargs kill
```

## Passkeys And HTTPS

For local testing, the default passkey settings are enough:

```toml
listen = "127.0.0.1:8010"
```

For phone or remote browser use, configure a stable HTTPS origin:

```toml
secure_cookies = true
webauthn_rp_id = "obr.example.com"
webauthn_origin = "https://obr.example.com"
```

Changing `webauthn_rp_id` or `webauthn_origin` invalidates existing passkeys for that domain. Register a new passkey after changing the public domain.

Once a passkey is registered, password login is disabled outside localhost. Localhost password login remains available as a recovery path.

## Tailscale Funnel Example

With Obr listening on `127.0.0.1:8010`, expose it through Tailscale Funnel:

```bash
tailscale funnel --yes --bg http://127.0.0.1:8010
```

Then set the WebAuthn config to the Funnel hostname:

```toml
secure_cookies = true
webauthn_rp_id = "obr.example.com"
webauthn_origin = "https://obr.example.com"
```

Replace `obr.example.com` with the HTTPS hostname that Tailscale Funnel prints
for your machine.

Check the public route:

```bash
tailscale funnel status
```

## Releases

Pushing a `v*` tag runs the release workflow. It builds the `obr` binary for:

- `x86_64-unknown-linux-gnu`
- `aarch64-unknown-linux-gnu`
- `x86_64-apple-darwin`
- `aarch64-apple-darwin`

Each release includes `obr-<target>.tar.gz` archives and SHA-256 checksums.

## CI

The GitHub Actions workflow runs the usual Rust checks:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
cargo build --release --locked
```

## Contributing And Security

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and
[SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

Obr is licensed under the [MIT License](LICENSE).
