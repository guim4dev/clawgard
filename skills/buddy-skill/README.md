# `@clawgard/buddy-skill`

SHA256-verified bootstrapper for the Go `clawgard-buddy` daemon, shipped as a
Claude Code skill. On first run this package downloads the pinned binary from
the matching GitHub release, verifies it against a hash compiled into this
tarball at publish time, caches it under your user cache dir, and hands off
to the binary. Subsequent runs use the cache when the on-disk hash still
matches.

## Install

```bash
npm i -g @clawgard/buddy-skill
# or, inside Claude Code: install as a skill and use the commands below.
```

## Commands

| Command   | Binary subcommand | Purpose                                               |
| --------- | ----------------- | ----------------------------------------------------- |
| `setup`   | `setup`           | Install / re-verify the binary and run setup flow.    |
| `start`   | `listen`          | Start the buddy. Forwards extra args to `listen`.     |
| `version` | `version`         | Print skill version + binary-reported version.        |

Example:

```bash
clawgard-buddy-skill-start -- --on-question "python answer.py"
```

## Trust model

- **Hashes compiled in at publish time.** Every `(platform, arch)` SHA256 is
  embedded in the published tarball in `src/lib/hashes.ts`. The hashes are
  *never* fetched from the network at runtime.
- **HTTPS-pinned release URL.** The download URL is built from the skill's own
  `package.json` version and points at
  `https://github.com/clawgard/clawgard/releases/download/v<version>/...`.
  Non-`https:` URLs are rejected. The `fetch` call uses `redirect: "error"` so
  cross-origin redirects fail closed.
- **Streamed verification before exec.** SHA256 is computed incrementally as
  the download streams to a `.part` file. Only after the hash matches do we
  `fs.rename` it into place and `chmod 0755` (non-Windows). There is no code
  path that exec's a binary whose SHA did not match.
- **Exclusive lock.** `setup` creates `<cache-root>/setup.lock` via
  `fs.open(path, "wx")`. If the file already exists, setup refuses to continue
  so two concurrent setups cannot race. If the previous process crashed, the
  lock is stale — remove it manually and re-run.
- See the repo-level `SECURITY.md` (Plan 6) for the full disclosure policy and
  end-to-end supply chain design.
- **Cosign signature verification.** Optional and off by default in MVP.
  Opt in with the `--verify-signature` flag (experimental — requires Cosign
  installed locally). The Cosign sidecar verification is wired in Plan 6's
  release pipeline.

## Troubleshooting

### "The clawgard-buddy binary ... did not match the expected hash."

Something served different bytes than the publisher expected. The file has
already been deleted from your cache. Steps:

1. Run `npm update @clawgard/buddy-skill` to pick up the latest skill (and
   therefore the latest expected hashes).
2. If the problem persists, open an issue at
   <https://github.com/clawgard/clawgard/issues> with the full error — the
   message prints both the expected and actual hashes.

### "platform <os>/<arch> is not supported"

The skill ships binaries for `darwin-arm64`, `darwin-amd64`, `linux-amd64`,
`linux-arm64`, `windows-amd64`. Other combinations are not published.

### "another setup appears to be running"

An exclusive lockfile exists at `<cache-root>/setup.lock`. If the previous
setup died (e.g., Ctrl-C), the lock is stale. Remove the file and retry.

## Development

This package lives in the `clawgard` monorepo under `skills/buddy-skill/`.

```bash
pnpm --filter @clawgard/buddy-skill run typecheck
pnpm --filter @clawgard/buddy-skill run build
pnpm --filter @clawgard/buddy-skill run test
```

Before publishing (done by CI / `prepublishOnly`):

```bash
pnpm --filter @clawgard/buddy-skill run inject-hashes
```

`inject-hashes` rewrites `src/lib/hashes.ts` from the matching GitHub release's
asset manifest. In the git repo `hashes.ts` is always the empty-map template;
a CI guardrail enforces this so we never commit real hashes.
