package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

type Thread struct {
	ID             uuid.UUID
	BuddyID        uuid.UUID
	HatchlingEmail string
	Status         string
	Turns          int
	CreatedAt      time.Time
	LastActivityAt time.Time
	ClosedAt       *time.Time
	CloseReason    string
}

type ThreadStore struct{ s *Store }

func (s *Store) Threads() *ThreadStore { return &ThreadStore{s: s} }

var (
	ErrThreadNotFound  = errors.New("thread not found")
	ErrTurnCapExceeded = errors.New("clarification turn cap exceeded")
	ErrThreadClosed    = errors.New("thread is closed")
)

func (t *ThreadStore) Open(ctx context.Context, buddyID uuid.UUID, hatchlingEmail string) (Thread, error) {
	id := uuid.New()
	var tr Thread
	var reason *string
	err := t.s.pool.QueryRow(ctx, `
		INSERT INTO threads (id, buddy_id, hatchling_email) VALUES ($1,$2,$3)
		RETURNING id, buddy_id, hatchling_email, status, turns, created_at, last_activity_at, closed_at, close_reason`,
		id, buddyID, hatchlingEmail,
	).Scan(&tr.ID, &tr.BuddyID, &tr.HatchlingEmail, &tr.Status, &tr.Turns,
		&tr.CreatedAt, &tr.LastActivityAt, &tr.ClosedAt, &reason)
	if err != nil {
		return tr, err
	}
	if reason != nil {
		tr.CloseReason = *reason
	}
	return tr, nil
}

func (t *ThreadStore) Get(ctx context.Context, id uuid.UUID) (Thread, error) {
	row := t.s.pool.QueryRow(ctx, `
		SELECT id, buddy_id, hatchling_email, status, turns, created_at, last_activity_at, closed_at, close_reason
		FROM threads WHERE id=$1`, id)
	var tr Thread
	var reason *string
	err := row.Scan(&tr.ID, &tr.BuddyID, &tr.HatchlingEmail, &tr.Status, &tr.Turns,
		&tr.CreatedAt, &tr.LastActivityAt, &tr.ClosedAt, &reason)
	if err != nil {
		return tr, ErrThreadNotFound
	}
	if reason != nil {
		tr.CloseReason = *reason
	}
	return tr, nil
}

func (t *ThreadStore) Close(ctx context.Context, id uuid.UUID, reason string) error {
	ct, err := t.s.pool.Exec(ctx, `
		UPDATE threads SET status='closed', closed_at=NOW(), close_reason=$2, last_activity_at=NOW()
		WHERE id=$1 AND status='open'`, id, reason)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		// Already closed is idempotent.
		return nil
	}
	return nil
}

// IncrementTurns atomically bumps turns if <3. Returns new count.
func (t *ThreadStore) IncrementTurns(ctx context.Context, id uuid.UUID) (int, error) {
	var newTurns int
	err := t.s.pool.QueryRow(ctx, `
		UPDATE threads SET turns = turns + 1, last_activity_at = NOW()
		WHERE id=$1 AND status='open' AND turns < 3
		RETURNING turns`, id).Scan(&newTurns)
	if err != nil {
		// Distinguish between closed thread and cap reached.
		current, gerr := t.Get(ctx, id)
		if gerr != nil {
			return 0, gerr
		}
		if current.Status == "closed" {
			return current.Turns, ErrThreadClosed
		}
		return current.Turns, ErrTurnCapExceeded
	}
	return newTurns, nil
}

// TouchActivity bumps last_activity_at (used on any message).
func (t *ThreadStore) TouchActivity(ctx context.Context, id uuid.UUID) error {
	_, err := t.s.pool.Exec(ctx, `UPDATE threads SET last_activity_at=NOW() WHERE id=$1`, id)
	return err
}

// ListFilter for admin queries.
type ListFilter struct {
	BuddyID        *uuid.UUID
	HatchlingEmail string
	From, To       *time.Time
	Limit          int
	Offset         int
}

// buildFilterClause shared by ListWithFilter and CountWithFilter.
func (f ListFilter) buildFilterClause(startIdx int) (string, []any, int) {
	q := " WHERE 1=1"
	args := []any{}
	idx := startIdx
	if f.BuddyID != nil {
		q += ` AND buddy_id=$` + itoa(idx)
		args = append(args, *f.BuddyID)
		idx++
	}
	if f.HatchlingEmail != "" {
		q += ` AND hatchling_email=$` + itoa(idx)
		args = append(args, f.HatchlingEmail)
		idx++
	}
	if f.From != nil {
		q += ` AND created_at>=$` + itoa(idx)
		args = append(args, *f.From)
		idx++
	}
	if f.To != nil {
		q += ` AND created_at<=$` + itoa(idx)
		args = append(args, *f.To)
		idx++
	}
	return q, args, idx
}

// ListWithFilter returns threads matching filters (admin).
func (t *ThreadStore) ListWithFilter(ctx context.Context, f ListFilter) ([]Thread, error) {
	clause, args, idx := f.buildFilterClause(1)
	q := `SELECT id, buddy_id, hatchling_email, status, turns, created_at, last_activity_at, closed_at, close_reason FROM threads` + clause + ` ORDER BY created_at DESC`
	if f.Limit > 0 {
		q += ` LIMIT $` + itoa(idx)
		args = append(args, f.Limit)
		idx++
	}
	if f.Offset > 0 {
		q += ` OFFSET $` + itoa(idx)
		args = append(args, f.Offset)
	}
	rows, err := t.s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Thread
	for rows.Next() {
		var tr Thread
		var reason *string
		if err := rows.Scan(&tr.ID, &tr.BuddyID, &tr.HatchlingEmail, &tr.Status, &tr.Turns,
			&tr.CreatedAt, &tr.LastActivityAt, &tr.ClosedAt, &reason); err != nil {
			return nil, err
		}
		if reason != nil {
			tr.CloseReason = *reason
		}
		out = append(out, tr)
	}
	return out, rows.Err()
}

// CountWithFilter returns the total number of threads matching the filter (ignoring Limit/Offset).
func (t *ThreadStore) CountWithFilter(ctx context.Context, f ListFilter) (int, error) {
	clause, args, _ := f.buildFilterClause(1)
	q := `SELECT COUNT(*) FROM threads` + clause
	var n int
	if err := t.s.pool.QueryRow(ctx, q, args...).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

// ListIdleOpen returns open threads whose last_activity_at is older than cutoff.
func (t *ThreadStore) ListIdleOpen(ctx context.Context, cutoff time.Time) ([]Thread, error) {
	rows, err := t.s.pool.Query(ctx, `
		SELECT id, buddy_id, hatchling_email, status, turns, created_at, last_activity_at, closed_at, close_reason
		FROM threads WHERE status='open' AND last_activity_at < $1`, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Thread
	for rows.Next() {
		var tr Thread
		var reason *string
		if err := rows.Scan(&tr.ID, &tr.BuddyID, &tr.HatchlingEmail, &tr.Status, &tr.Turns,
			&tr.CreatedAt, &tr.LastActivityAt, &tr.ClosedAt, &reason); err != nil {
			return nil, err
		}
		if reason != nil {
			tr.CloseReason = *reason
		}
		out = append(out, tr)
	}
	return out, rows.Err()
}

func itoa(i int) string {
	// fast int to string for small positive ints
	if i == 0 {
		return "0"
	}
	buf := [16]byte{}
	pos := len(buf)
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	return string(buf[pos:])
}
