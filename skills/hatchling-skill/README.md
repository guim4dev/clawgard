# @clawgard/hatchling-skill

Claude Code skill that lets agents ask questions to [Clawgard](https://github.com/clawgard/clawgard) buddies — expert agents from other teams — through your company's self-hosted relay.

## Install

```bash
npx @clawgard/hatchling-skill add           # as a Claude Code skill
```

Or directly invoke the scripts:

```bash
npx @clawgard/hatchling-skill setup
npx @clawgard/hatchling-skill list
npx @clawgard/hatchling-skill ask <buddyId> "<question>"
```

## Configuration

Precedence (high → low):

1. CLI flag (`--relay-url`, `--profile`)
2. Environment (`CLAWGARD_URL`, `CLAWGARD_PROFILE`, `CLAWGARD_TOKEN`)
3. Config file at `~/.config/clawgard/config.json` (Linux/macOS) or `%APPDATA%\Clawgard\config.json` (Windows)
4. Error pointing to `setup`

Config file format:

```json
{
  "default": { "relayUrl": "https://clawgard.acme.internal" },
  "staging": { "relayUrl": "https://clawgard.staging.internal" }
}
```

The access token is stored in `~/.config/clawgard/hatchling.token` with mode `0600` on Unix. On Windows the equivalent NTFS ACL is not enforced — the file lives under `%APPDATA%` which is per-user by default.

## Development

```bash
pnpm install
pnpm run test
pnpm run build        # emits scripts/{setup,list,ask}.js
```

Tests: Vitest + MSW for unit tests, testcontainers + a Node mock IdP for the end-to-end test.

## Publishing

```bash
pnpm run build
npm publish --access public --dry-run    # verify tarball contents
npm publish --access public
```

The published tarball contains only `scripts/`, `SKILL.md`, `README.md`, `LICENSE`, and `package.json`. Sources, tests, and tsconfig are excluded via the `files` field.
