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

## Password

Generate an Argon2 password hash:

```bash
printf '%s' "YOUR_PASSWORD" | ./target/release/obr hash-password
```

Put the generated value in `config/local.toml`:

```toml
username = "admin"
password_hash = "$argon2id$..."
allow_plaintext_password = false
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
webauthn_rp_id = "ob.example.ts.net"
webauthn_origin = "https://ob.example.ts.net"
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
webauthn_rp_id = "ob.tailnet-name.ts.net"
webauthn_origin = "https://ob.tailnet-name.ts.net"
```

Check the public route:

```bash
tailscale funnel status
```

## CI

The GitHub Actions workflow runs the usual Rust checks:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
cargo build --release --locked
```
