# Contributing to Clawgard

Welcome. This file covers the ground rules; the architecture and MVP scope live in [`docs/design/2026-04-16-initial-architecture.md`](./docs/design/2026-04-16-initial-architecture.md).

## Commit conventions

**Conventional Commits, strictly.** The release changelog is generated from them.

Format: `type(scope): subject`

Types: `feat`, `fix`, `refactor`, `test`, `chore`, `ci`, `docs`.

Scopes used in this repo:
- `server` — Go relay server (`server/`)
- `buddy-cli` — Go buddy daemon (`buddy-cli/`)
- `hatchling-skill` — pure-Node skill (`skills/hatchling-skill/`)
- `buddy-skill` — Go binary wrapper skill (`skills/buddy-skill/`)
- `openclaw-buddy` — OpenClaw bridge skill (`skills/openclaw-buddy/`)
- `spec` — OpenAPI spec (`spec/`)
- `dashboard` — embedded Vue SPA (`server/web/`)
- `release`, `ci`, `docs`, `security`, `deps`

One logical change per commit. If your diff spans multiple scopes, split it.

## Branch strategy

- `main` is always shippable.
- Feature branches: `feat/<short-desc>` or, for planned work, `feat/plan-NN-<short-desc>`.
- No force-pushes to `main`. Never retag a released `v*` tag.
- Merge via PR with at least one approval. CI must be green.

## How to run the tests

```bash
# Go unit + integration (testcontainers-go spins up Postgres)
make test

# Or narrow:
cd server && go test ./internal/router/...
cd buddy-cli && go test ./...

# Node/TS
pnpm -r test

# End-to-end (server + echo buddy + hatchling)
./scripts/e2e-serve.sh
```

The full matrix runs in CI on every PR. `make lint test` must pass locally before you push.

## How to propose a new operation / endpoint

1. **Update the OpenAPI spec first** (`spec/clawgard.openapi.yaml`). Lint must pass: `make lint`.
2. Regenerate types: `make generate`. Generated files (`spec-go/generated.go`, `spec-ts/src/generated.ts`) are gitignored — `make generate` runs in CI.
3. **TDD the behavior change.** Write a failing test in the relevant package (`server/internal/...` or `buddy-cli/internal/...`), watch it fail for the right reason, then implement.
4. If you're adding a buddy-operation type, also update the `BuddyFrame` discriminated union in the spec and the corresponding Go / TS types.
5. Update `docs/design/` if the change is architectural (new trust boundary, new persistence shape, new external dependency). Small endpoints don't need a design update.

## Authoring a new Node skill

Known gotcha that has bitten us twice: skills that ship a CLI binary **must** gate their entrypoint with the Windows-safe check — not the naive `file://` URL comparison.

```ts
import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
```

The shorter `import.meta.url === \`file://${process.argv[1]}\`` pattern breaks on Windows paths (backslash vs forward slash, drive letters) and has caused CI failures in both `hatchling-skill` (fixed in `3b98503`) and `openclaw-buddy` (fixed in `4b0456e`). When copying from an existing skill, verify this specific line.

## Code review expectations

- Reviewer reads the spec delta first, then the tests, then the implementation.
- A PR without tests is rejected unless it's a pure rename / config bump / doc change — and even then, say so explicitly in the description.
- Security-relevant changes (auth, ACL, release pipeline) must be reviewed by a maintainer.

## Release process (maintainers only)

1. Ensure `main` is green and `SECURITY.md` / `CONTRIBUTING.md` are up to date.
2. Verify the Pre-flight section of [`SECURITY.md`](./SECURITY.md) is complete (homebrew-tap / scoop-bucket repos exist, PATs wired, `NPM_TOKEN` set).
3. Tag from `main`: `git tag -s vX.Y.Z -m "Release vX.Y.Z"`. Use an annotated, signed tag.
4. `git push origin vX.Y.Z` triggers `.github/workflows/release.yml`.
5. After the release job finishes, `.github/workflows/npm-publish.yml` fires automatically on `release: published`.
6. Run `scripts/release/verify-release.sh vX.Y.Z` from a clean checkout. It's also run as a CI job — confirm that's green.
7. Announce in the GitHub Release notes (generated from Conventional Commits).

### Rollback

See [`SECURITY.md`](./SECURITY.md) "Rollback runbook". Short version: `npm deprecate`, never retag, always new release.

## Reporting security issues

See [`SECURITY.md`](./SECURITY.md). Short version: private advisory, not a public issue.
