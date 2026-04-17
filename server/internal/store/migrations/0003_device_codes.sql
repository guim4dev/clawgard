CREATE TABLE device_codes (
    device_code   TEXT PRIMARY KEY,
    user_code     TEXT NOT NULL UNIQUE,
    expires_at    TIMESTAMPTZ NOT NULL,
    interval_seconds INT NOT NULL DEFAULT 5,
    approved_email TEXT,
    approved_at   TIMESTAMPTZ,
    last_polled_at TIMESTAMPTZ
);

CREATE INDEX idx_device_codes_expires ON device_codes(expires_at);
