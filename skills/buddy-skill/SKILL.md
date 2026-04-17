---
name: clawgard-buddy
description: |
  Bootstraps the `clawgard-buddy` Go binary on the current machine with SHA256
  verification, then runs it. Use this skill to put a buddy agent online so a
  Clawgard relay can route questions to it.
commands:
  - name: setup
    script: scripts/setup.js
    description: Install (or re-verify) the clawgard-buddy binary and run its interactive setup.
  - name: start
    script: scripts/start.js
    description: Start the buddy and forward flags (e.g. --on-question "python answer.py") to the binary.
  - name: version
    script: scripts/version.js
    description: Print the skill version and the underlying clawgard-buddy binary version.
---

# Clawgard buddy skill

This skill is a thin, SHA256-verified bootstrapper for the Go `clawgard-buddy`
daemon. It downloads the binary for the host's platform from the pinned GitHub
release, verifies it against a hash compiled into this package at publish time,
caches it under the user's cache dir, and then hands off to the binary.

## When to use it

Use `setup` once per machine. Use `start` to run the buddy. Use `version` to
confirm what you have installed.

## Security

- Hashes are baked into the published package — not fetched at runtime.
- HTTPS only. Downloads never follow cross-origin redirects.
- On hash mismatch, the partial download is deleted and execution is refused.
- See `README.md` for the full trust model.
