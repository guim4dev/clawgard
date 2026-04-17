package store

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type Message struct {
	ID        uuid.UUID
	ThreadID  uuid.UUID
	Role      string
	Type      string
	Content   string
	CreatedAt time.Time
}

type NewMessage struct {
	ThreadID uuid.UUID
	Role     string
	Type     string
	Content  string
}

type MessageStore struct{ s *Store }

func (s *Store) Messages() *MessageStore { return &MessageStore{s: s} }

func (m *MessageStore) Append(ctx context.Context, in NewMessage) (Message, error) {
	id := uuid.New()
	var msg Message
	err := m.s.pool.QueryRow(ctx, `
		INSERT INTO messages (id, thread_id, role, type, content)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id, thread_id, role, type, content, created_at`,
		id, in.ThreadID, in.Role, in.Type, in.Content,
	).Scan(&msg.ID, &msg.ThreadID, &msg.Role, &msg.Type, &msg.Content, &msg.CreatedAt)
	if err != nil {
		return msg, err
	}
	// Bump thread activity so sweeper doesn't auto-close.
	_, _ = m.s.pool.Exec(ctx, `UPDATE threads SET last_activity_at=NOW() WHERE id=$1`, in.ThreadID)
	return msg, nil
}

func (m *MessageStore) List(ctx context.Context, threadID uuid.UUID) ([]Message, error) {
	rows, err := m.s.pool.Query(ctx, `
		SELECT id, thread_id, role, type, content, created_at
		FROM messages WHERE thread_id=$1 ORDER BY created_at ASC`, threadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.ID, &msg.ThreadID, &msg.Role, &msg.Type, &msg.Content, &msg.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, msg)
	}
	return out, rows.Err()
}

// ListSince returns messages created strictly after `since` (long-poll helper).
func (m *MessageStore) ListSince(ctx context.Context, threadID uuid.UUID, since time.Time) ([]Message, error) {
	rows, err := m.s.pool.Query(ctx, `
		SELECT id, thread_id, role, type, content, created_at
		FROM messages WHERE thread_id=$1 AND created_at > $2 ORDER BY created_at ASC`, threadID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.ID, &msg.ThreadID, &msg.Role, &msg.Type, &msg.Content, &msg.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, msg)
	}
	return out, rows.Err()
}
