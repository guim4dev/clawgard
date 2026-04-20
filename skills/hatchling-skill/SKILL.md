---
name: clawgard-hatchling
description: Ask Clawgard buddies (expert agents) questions via one or more self-hosted relays. Use when you need knowledge from another team's (or another company's) domain-expert agent.
---

# Clawgard Hatchling

This skill lets you ask questions to Clawgard **buddies** — expert agents hosted by other teams in your organization, or by other companies you work with — through one or more self-hosted relays. Use it when the user asks something that belongs to a domain another team knows better than you do (e.g. "how does our payments retry work?", "where is the API key rotation SOP?").

The skill is **multi-relay by default**: you can register N relays side-by-side, each with independent OIDC credentials, and ask any buddy on any of them using a namespaced reference `<alias>/<name>`. **The relay alias is the context — use it to pick which company's buddy you're asking.** Never mix an alias from Company A with a buddy name that only exists on Company B; the skill will refuse.

## Scripts provided

- `clawgard-hatchling-setup` — interactively register a relay (pick a URL, sign in with OIDC). Run once per relay you want to reach. Use `--profile <alias>` to give each relay a short, memorable name.
- `clawgard-hatchling-setup --list-relays` — print the configured relays as `{ alias, relayUrl, tokenPresent }`.
- `clawgard-hatchling-setup --remove-relay <alias>` — unregister a relay and delete its token file.
- `clawgard-hatchling-list` — show buddies across every configured relay, grouped by alias. Each row includes a `ref` field (`<alias>/<name>`) — this is the value to pass to `ask`.
- `clawgard-hatchling-ask <alias>/<name> "<question>"` — open a thread with the named buddy on the named relay. Preferred form.
- `clawgard-hatchling-ask <uuid> [--profile <alias>]` — legacy form, when you already have a buddy's UUID. Still works unchanged.

## When to run setup

Run once per relay you want to reach. Triggers:

- The user says "set up Clawgard" or "connect me to Clawgard".
- The user wants to add a second company or tenant (`setup --profile <new-alias>`).
- Any `list` or `ask` call fails with "run `clawgard-hatchling-setup --profile <alias>`".

Registering a new relay does **not** invalidate any other relay's session — each alias owns its own token file.

```bash
clawgard-hatchling-setup                               # interactive, profile defaults to `default`
clawgard-hatchling-setup --profile a                   # register Company A
clawgard-hatchling-setup --profile b                   # register Company B (leaves `a` untouched)
clawgard-hatchling-setup --relay-url https://clawgard.acme.internal --profile a
```

## Example session — two relays configured

```bash
# 1. Register both companies' relays (each opens its own OIDC device-code flow).
clawgard-hatchling-setup --profile a --relay-url https://clawgard.a.example
clawgard-hatchling-setup --profile b --relay-url https://clawgard.b.example

# 2. See every buddy on every relay, grouped by alias.
clawgard-hatchling-list
# a:
#   ref: a/api-expert       online   — Knows the payments API
#   ref: a/ops-expert       offline  — On-call runbooks
# b:
#   ref: b/data-expert      online   — Warehouse + dbt models

# 3. Ask a buddy on Company A's relay — the `a/` prefix IS the context;
#    no `--profile` flag needed, and Company B's token is never used.
clawgard-hatchling-ask a/api-expert "how do we page through /users?"

# 4. Ask a buddy on Company B's relay in the same shell, immediately after.
clawgard-hatchling-ask b/data-expert "which table stores MAU?"

# 5. Manage the configured relays when needed.
clawgard-hatchling-setup --list-relays
clawgard-hatchling-setup --remove-relay b
```

## When to run list

Call `list` before `ask` if you don't already know the buddy's `ref` or aren't sure which buddy is relevant. By default `list` fans out to every configured relay in parallel and prints one section per alias. Each row shows `ref`, `id`, `description`, `owner`, and `online`/`offline`.

```bash
clawgard-hatchling-list              # every configured relay, merged view
clawgard-hatchling-list --profile a  # only Company A's relay
clawgard-hatchling-list --json       # machine-readable: [{ relay, ref, id, name, description, ownerEmail, online }, ...]
```

If one relay is down (network error, 401, missing token), `list` prints an error row for that alias but still returns buddies from the others. It exits non-zero only when **every** configured relay fails. If no buddies appear under an alias the user can reach, their account has no ACL access on that relay yet — tell them to ask the Clawgard admin for that company.

## When to run ask

Use `ask` when you have a specific question and know (from `list`) which buddy fits. The `<alias>/<name>` form is the recommended reference: it is readable, explainable back to the user, and removes any need to juggle `--profile` flags.

```bash
clawgard-hatchling-ask a/api-expert "How does the payments retry work for declined cards?"
```

Behaviour:
- The alias prefix picks the relay *and* the OIDC token. No `--profile` needed.
- The buddy may reply directly (one-shot).
- The buddy may reply with a clarification question. The script prints it and reads your reply from stdin. You get up to 3 clarification turns before the thread is force-closed by the server.
- If the buddy is offline you get an error — the relay does not queue. Try again later, or ask a different buddy (possibly on a different relay).
- If the prefix is not a configured alias, or the buddy name is not found on that relay, `ask` exits non-zero with a clear message naming the alias.

The legacy `clawgard-hatchling-ask <uuid> [--profile <alias>]` form still works unchanged — use it only when you have a bare UUID from another source. Prefer the namespaced form whenever possible.

## Environment variables

- `CLAWGARD_URL` — override the relay URL (transient single-relay use; bypasses config/token files).
- `CLAWGARD_PROFILE` — select a profile (alias) from the config file.
- `CLAWGARD_TOKEN` — override the saved access token for the resolved alias (useful in CI).

## Config and token layout

- Linux/macOS: `~/.config/clawgard/`
  - `config.json` — `{ "<alias>": { "relayUrl": "..." } }`
  - `tokens/<alias>.token` — one file per alias, mode `0600`
- Windows: `%APPDATA%\Clawgard\` with the same layout (`config.json` and `tokens\<alias>.token`).

Legacy migration: if a pre-existing `hatchling.token` file from an older single-token version is present, the skill migrates it once to `tokens/default.token` on the next `setup`, `list`, or `ask` call, then deletes the original. A one-line info message is logged. No action is required from the user.

## What this skill does NOT do

- It does not register buddies. That's the buddy owner's job (via `@clawgard/buddy-skill`).
- It does not stream partial answers — buddies return a single answer per turn.
- It does not chat freely — hard cap of 3 clarification turns per thread.
- It does not broadcast a question across relays — each `ask` targets exactly one buddy on one relay.
