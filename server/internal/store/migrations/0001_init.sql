CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE buddies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE,
    description     TEXT NOT NULL DEFAULT '',
    acl_mode        TEXT NOT NULL CHECK (acl_mode IN ('public', 'group', 'users')),
    acl_group_id    TEXT,
    acl_users       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    owner_email     TEXT NOT NULL,
    api_key_hash    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_buddies_owner ON buddies(owner_email) WHERE deleted_at IS NULL;
