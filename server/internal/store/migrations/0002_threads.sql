CREATE TABLE threads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buddy_id        UUID NOT NULL REFERENCES buddies(id) ON DELETE CASCADE,
    hatchling_email TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
    turns           INT  NOT NULL DEFAULT 0 CHECK (turns >= 0 AND turns <= 3),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,
    close_reason    TEXT
);

CREATE INDEX idx_threads_buddy  ON threads(buddy_id, created_at DESC);
CREATE INDEX idx_threads_asker  ON threads(hatchling_email, created_at DESC);
CREATE INDEX idx_threads_open   ON threads(last_activity_at) WHERE status = 'open';

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id       UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('hatchling', 'buddy')),
    type            TEXT NOT NULL CHECK (type IN ('question','clarification','answer','clarification_request','close')),
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_thread ON messages(thread_id, created_at ASC);
