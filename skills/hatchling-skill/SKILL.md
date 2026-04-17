---
name: clawgard-hatchling
description: Ask Clawgard buddies (expert agents) questions via your company's self-hosted relay. Use when you need knowledge from another team's domain-expert agent.
---

# Clawgard Hatchling

This skill lets you ask questions to Clawgard **buddies** — expert agents hosted by other teams in your organization — through a self-hosted relay. Use it when the user asks something that belongs to a domain another team knows better than you do (e.g. "how does our payments retry work?", "where is the API key rotation SOP?").

## Scripts provided

- `clawgard-hatchling-setup` — one-time: pick a relay URL and sign in with OIDC.
- `clawgard-hatchling-list` — show buddies you're allowed to talk to.
- `clawgard-hatchling-ask <buddyId> "<question>"` — open a thread with a buddy; answers stream back; up to 3 clarification turns allowed.

## When to run setup

Run once per machine (or once per profile). Examples of triggers:

- The user says "set up Clawgard" or "connect me to Clawgard".
- Any `list` or `ask` call fails with "run `clawgard-hatchling-setup`".
- The user wants to add a new profile (`--profile staging`).

```bash
clawgard-hatchling-setup                             # interactive, default profile
clawgard-hatchling-setup --relay-url https://clawgard.acme.internal
clawgard-hatchling-setup --profile staging
```

## When to run list

Before asking, call `list` if you don't already know the buddy's ID or aren't sure which buddy is relevant.

```bash
clawgard-hatchling-list
```

Output shows, per buddy: `name`, `id`, `description`, `owner`, and `online`/`offline`. If no buddies are listed, the user's account has no ACL access yet — tell them to ask their Clawgard admin.

## When to run ask

Use `ask` when you have a specific question and know the buddy ID. Pick the buddy whose `description` best matches the topic.

```bash
clawgard-hatchling-ask <buddyId> "How does the payments retry work for declined cards?"
```

Behaviour:
- The buddy may reply directly (one-shot).
- The buddy may reply with a clarification question. The script prints it and reads your reply from stdin. You get up to 3 clarification turns before the thread is force-closed by the server.
- If the buddy is offline you get an error — the relay does not queue. Try again later or ask a different buddy.

## Environment variables

- `CLAWGARD_URL` — override relay URL.
- `CLAWGARD_PROFILE` — select a profile from the config file.
- `CLAWGARD_TOKEN` — override the saved access token (useful in CI).

Config file location:

- Linux/macOS: `~/.config/clawgard/config.json` (+ `hatchling.token`, mode 0600).
- Windows: `%APPDATA%\Clawgard\config.json`.

## What this skill does NOT do

- It does not register buddies. That's the buddy owner's job (via `@clawgard/buddy-skill`).
- It does not stream partial answers — buddies return a single answer per turn.
- It does not chat freely — hard cap of 3 clarification turns per thread.
