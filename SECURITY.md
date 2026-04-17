# Security Policy — Clawgard

**Status:** v0.1. This document evolves with the project. Version it like any other spec.

## Reporting a vulnerability

File a **private** GitHub Security Advisory:
https://github.com/clawgard/clawgard/security/advisories/new

An email alias at `security@clawgard.dev` is planned but **the `clawgard.dev` domain is not yet registered** — until it is, only the GitHub Security Advisories channel is live. We acknowledge within **3 business days** and aim for a fix or public disclosure within 90 days.

Do **not** open a public issue for a suspected vulnerability.

## Threat model

Clawgard is a **self-hosted** relay. The threat model is written from the operator's point of view: what does a company running Clawgard need to trust, and what does Clawgard protect them from?

### What the relay sees
- Every question a hatchling asks its buddy (full text).
- Every answer the buddy produces (full text).
- The identity of the asker (email from the OIDC token) and the buddy (API key → buddy record).
- Thread metadata (timestamps, turn count, clarification traffic).

### What the relay stores
- All of the above, in Postgres, owned by the operator. **Default retention: 90 days** (configurable 1–365 or disable). Admin can purge manually from the dashboard.
- **No outbound telemetry.** Period. The server makes zero calls to the maintainers' infrastructure. The only outbound calls are to the OIDC provider the operator configures.

### What the relay does *not* see
- Any traffic between a buddy and its backing agent framework (OpenClaw, Claude API, local model, etc.). The `--on-question` hook runs in the buddy operator's process.
- Any data the buddy agent has access to beyond what it returns in an answer.
- Any hatchling-side agent state outside the question text.

### Trust boundaries (MVP)

| Boundary | Trusted | Untrusted |
|---|---|---|
| Hatchling → relay | OIDC access token (short-lived) | Anything without a valid token |
| Buddy → relay | API key (long-lived, rotatable) | Anything without a valid key |
| Relay → Postgres | Connection string + TLS (operator config) | Network between them if operator doesn't configure TLS |
| Buddy daemon → hook | stdin/stdout JSON | Hook runs as the buddy OS user; treat it as trusted local code |

## Supply chain

Lessons learned from the ClawBuddy incident are codified here.

### No parallel registries
- `@clawgard/hatchling-skill` and `@clawgard/buddy-skill` are published **only to the official npm registry** (`https://registry.npmjs.org`). If you see these packages on any other registry, that's a supply-chain attack — report it.
- Every npm publish ships with **npm provenance attestations** via GitHub OIDC. Verify with:
  ```bash
  npm audit signatures @clawgard/hatchling-skill @clawgard/buddy-skill
  ```
- Docker images are published **only to GHCR**: `ghcr.io/clawgard/server` and `ghcr.io/clawgard/buddy`. Docker Hub mirroring is deliberately deferred while keyless signing is still new — one source of truth at a time.

### SHA256-pinned binary download
- `@clawgard/buddy-skill` bundles a hashes file at publish time containing the SHA256 of the `clawgard-buddy` binary for each `(os, arch)` combo it supports (implemented in Plan 4's bootstrap path).
- On first run, it downloads the binary from the GitHub Release matching its own `BUDDY_VERSION`, re-hashes it, and **refuses to execute on mismatch**.
- Hash injection is performed by `scripts/release/build-skill-hashes.sh` (reads `checksums.txt` from the just-created GitHub Release) and `skills/buddy-skill/scripts-dev/build-skill.ts` (consumed by the `prepublishOnly` npm hook). Both run only from the `npm-publish.yml` workflow — they cannot be run locally against an unreleased version.

### Signed releases
- **Binaries, archives, checksums**: Cosign keyless signed via Sigstore/Fulcio. OIDC issuer: `https://token.actions.githubusercontent.com`. Identity: `https://github.com/clawgard/clawgard/.github/workflows/release.yml@refs/tags/<tag>`.
- **Docker images**: `cosign verify ghcr.io/clawgard/server:<version>` succeeds using the same identity.
- **SBOMs**: SPDX-JSON, one per archive and per Docker image.
- Verify a whole release end-to-end:
  ```bash
  scripts/release/verify-release.sh v0.1.0
  ```

### Reproducible builds
- `-trimpath`, `CGO_ENABLED=0`, `-buildvcs=false`, pinned Go version (`1.26.2` in `release.yml`, matches `go.work`), pinned `mod_timestamp` from commit date.
- CI runs `scripts/release/check-reproducible.sh` on every PR — two builds of the same commit must produce byte-identical binaries.
- We deliberately do **not** use UPX or similar packers. They defeat signing and trigger AV false positives.

### Public threat model
This document itself is part of the supply-chain commitment. Every guarantee above is falsifiable from a fresh checkout — run the verifier scripts and the reproducibility check.

### Zero outbound telemetry
The `clawgard-server` binary makes **zero** outbound calls to maintainer-controlled infrastructure. The only remotes it talks to are (a) the operator's Postgres DSN and (b) the operator's configured OIDC issuer. Verified by integration tests (no `clawgard.dev`, no `anthropic.com`, no third-party analytics) and by the SBOM (no embedded analytics SDKs).

### Retention defaults
- Thread transcripts retained **90 days** by default. Operators configure 1–365 days or disable retention entirely via `CLAWGARD_RETENTION_DAYS`.
- Admin users can purge any thread manually from the dashboard.
- No retention-bypass path exists for maintainers — the operator's database is the only persistence surface.

## Pre-flight (one-time setup, before the first tagged release)

These are external resources the release pipeline depends on. Until they're
provisioned, `v*` tags will fail at the corresponding workflow step — which is
the correct signal; do **not** work around it with a long-lived token.

1. **Create the tap and bucket repos** under the `clawgard` org, each seeded with a single `README.md`:
   - `clawgard/homebrew-tap` (contains `Formula/`)
   - `clawgard/scoop-bucket` (contains `bucket/`)
2. **Provision two fine-grained PATs** (1-year expiry, owner = maintainer bot if one exists, else a maintainer personal account), each scoped to exactly one of those repos with `contents: read/write`:
   - `HOMEBREW_TAP_TOKEN`
   - `SCOOP_BUCKET_TOKEN`
   Save both as repo secrets on `clawgard/clawgard` under Settings → Secrets and variables → Actions.
3. **Confirm `packages: write`** is allowed for GitHub Actions at the org level so GHCR pushes work (Settings → Actions → General → Workflow permissions).
4. **npm org `@clawgard`** must exist with either an automation token (`NPM_TOKEN` secret) or a Trusted Publisher binding to the main repo. For provenance, the workflow already requests `id-token: write`; Trusted Publishers is preferred.

Until this pre-flight is complete, **Plan 6 deliverables exist but are inert**: the GoReleaser config, workflows, and scripts are all in place; the first `git push origin vX.Y.Z` will fail at the first missing external dependency. Fix the one that failed, re-push the same tag? No — **tags are append-only**, cut a new one (`vX.Y.(Z+1)-rc.1`) until everything passes, then cut the real tag.

## Rollback runbook

**Principle:** releases are append-only. Never retag a `v*` tag; never delete a GitHub Release once it's been up for more than a few minutes (npm mirrors it instantly).

If a signed artifact is compromised or ships broken:

1. **npm** — packages cannot be deleted after 72 hours. Run:
   ```bash
   npm deprecate @clawgard/buddy-skill@<bad-version> \
     "This version has been yanked. Upgrade to <good-version>. See https://github.com/clawgard/clawgard/security/advisories/<id>."
   ```
   Do the same for `@clawgard/hatchling-skill` if affected.
2. **GitHub Release** — edit the release notes to prefix with `[YANKED]`, link the advisory, and mark the release as pre-release.
3. **Docker** — push a replacement tag pointing at the previous known-good digest (not a re-tag of the same version):
   ```bash
   docker buildx imagetools create -t ghcr.io/clawgard/server:<bad-version>-yanked ghcr.io/clawgard/server:<previous-good-version>
   ```
   Communicate the yanked state in the advisory. Do not retag the original.
4. **Homebrew / Scoop** — push a commit to each tap repo removing the bad version's formula/manifest entry; bump users to the next good release via `brew upgrade`.
5. **Publish a GitHub Security Advisory** on the main repo explaining what happened, what the fix is, and what users should do.

## Token rotation

Both `HOMEBREW_TAP_TOKEN` and `SCOOP_BUCKET_TOKEN` are fine-grained PATs with 1-year expiry. Rotate them **quarterly**:

1. Generate a new PAT with the same scope (`contents: read/write` on the target repo only).
2. Update the repo secret in `clawgard/clawgard`.
3. Cut a `v0.X.Y-rc.0` tag on a non-main branch to exercise the pipeline with the new token.
4. Revoke the old PAT once the rc run is green.

`NPM_TOKEN` is similar; prefer npm Trusted Publishers (no static token to rotate) once wired.

## Sigstore / Fulcio outage policy

Cosign keyless signing depends on Sigstore/Fulcio availability. If the release step fails because Sigstore is down:

- **Do not** disable signing as a workaround. An unsigned release defeats the entire supply-chain story.
- Wait for Sigstore recovery (typically under an hour). Re-run the release workflow against the same tag via `gh workflow run release.yml --ref <tag>`.
- If the outage is prolonged (> 24h), cut a new tag `v<X>.<Y>.<Z>-rc.1` and retry — never retag.

## Disclosure process

- Day 0: report received.
- ≤ 3 business days: acknowledgement.
- ≤ 30 days: fix candidate in a private branch; coordinated disclosure window scheduled.
- ≤ 90 days: public disclosure via GitHub Security Advisory + CVE if applicable.

For anything actively exploited, we accelerate — but never skip the acknowledgement step.
