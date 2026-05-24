# Contributing

Thanks for considering a contribution to Obr.

## Development Setup

Install Rust stable, then run:

```bash
cargo build
cargo test --locked
```

For local testing, copy the example config:

```bash
cp config.example.toml config/local.toml
```

Point `vault_path` at a test vault or a disposable symlink. Do not develop
against a vault that contains data you cannot afford to modify.

For a disposable local vault, run:

```bash
cp -R examples/vault vault
```

Generate a local password hash before running the app:

```bash
cargo run -- hash-password
```

Then paste the generated `password_hash` line into `config/local.toml`.

## Checks

Before opening a pull request, run:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
cargo build --release --locked
```

## Security And Privacy

Do not commit real vault content, screenshots containing private notes,
personal domains, credentials, tokens, passkey stores, logs, or runtime cache
data. The following paths are local runtime state and should remain untracked:

- `config/local.toml`
- `vault`
- `data`
- `logs`
- `cache`
- `target`

Use neutral placeholder domains such as `example.com` in docs and tests.

## Pull Requests

Keep changes focused. Pair user-visible behavior changes with README or config
example updates, and add focused tests when a change touches parsing,
authentication, path handling, syncing, or markdown rendering.
