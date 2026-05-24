# Security Policy

Obr is a personal web app that reads and writes an Obsidian vault. Treat vault
content, uploaded images, drafts, cached pages, passkeys, logs, and outbox data
as sensitive local data.

## Supported Versions

Security fixes are handled on the default branch. Until the project publishes
versioned releases, please test and report issues against the latest commit.

## Reporting a Vulnerability

Please do not report security vulnerabilities in public issues.

Use GitHub's private vulnerability reporting for this repository. Include:

- affected commit or release
- how Obr is deployed
- whether the instance is local-only, behind a private network, or exposed over HTTPS
- reproduction steps
- expected impact

If private vulnerability reporting is unavailable, contact the maintainer
through the GitHub repository profile and ask for a private reporting channel.

## Deployment Notes

When Obr is reachable from a phone or any remote browser:

- serve it only through HTTPS
- set `secure_cookies = true`
- keep `webauthn_rp_id` and `webauthn_origin` stable
- avoid exposing Obr directly to the public internet without an additional
  trusted access-control layer
- keep `config/local.toml`, `data/`, `logs/`, and the vault outside public Git history
