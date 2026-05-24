# Changelog

All notable changes to Obr will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows semantic versioning once versioned releases begin.

## Unreleased

- Prepare the project for public open-source use.
- Embed frontend assets into the release binary for single-binary deployment.
- Add local-first mobile reading, editing, image preview, offline, and sync
  queue improvements.
- Add GitHub Release builds for macOS/Linux x86_64 and arm64 with checksums.
- Add request Host/Origin protection for browser-originated writes.
- Add `obr doctor` / `obr check` deployment diagnostics.
- Add a disposable demo vault under `examples/demo-vault`.
- Add real `obr daemon start|stop|reload|status` process control.
