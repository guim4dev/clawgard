package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ACL is the persisted access-control shape for a buddy.
type ACL struct {
	Mode    string   `json:"mode"` // public | group | users
	GroupID string   `json:"groupId,omitempty"`
	Users   []string `json:"users,omitempty"`
}

// Buddy is the domain entity.
type Buddy struct {
	ID          uuid.UUID
	Name        string
	Description string
	OwnerEmail  string
	APIKeyHash  string
	ACL         ACL
	CreatedAt   time.Time
	LastSeenAt  *time.Time
	DeletedAt   *time.Time
}

// NewBuddy is the creation payload.
type NewBuddy struct {
	Name        string
	Description string
	OwnerEmail  string
	APIKeyHash  string
	ACL         ACL
}

// UpdateBuddy is the partial-update payload.
type UpdateBuddy struct {
	Description *string
	ACL         *ACL
}

// BuddyStore methods.
type BuddyStore struct{ s *Store }

// Buddies returns the buddy store accessor.
func (s *Store) Buddies() *BuddyStore { return &BuddyStore{s: s} }

var ErrBuddyNotFound = errors.New("buddy not found")

// Create inserts a new buddy.
func (b *BuddyStore) Create(ctx context.Context, in NewBuddy) (Buddy, error) {
	id := uuid.New()
	users := in.ACL.Users
	if users == nil {
		users = []string{}
	}
	row := b.s.pool.QueryRow(ctx, `
		INSERT INTO buddies (id, name, description, acl_mode, acl_group_id, acl_users, owner_email, api_key_hash)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, name, description, acl_mode, acl_group_id, acl_users, owner_email, api_key_hash, created_at, last_seen_at, deleted_at`,
		id, in.Name, in.Description, in.ACL.Mode, nullable(in.ACL.GroupID), users, in.OwnerEmail, in.APIKeyHash,
	)
	buddy, err := scanBuddy(row)
	if err != nil {
		return Buddy{}, fmt.Errorf("insert buddy: %w", err)
	}
	return buddy, nil
}

// Get fetches a single buddy by id (returns ErrBuddyNotFound if missing or deleted).
func (b *BuddyStore) Get(ctx context.Context, id uuid.UUID) (Buddy, error) {
	return b.GetByID(ctx, id)
}

// GetByID is an alias for Get; kept for call-site clarity.
func (b *BuddyStore) GetByID(ctx context.Context, id uuid.UUID) (Buddy, error) {
	row := b.s.pool.QueryRow(ctx, `
		SELECT id, name, description, acl_mode, acl_group_id, acl_users, owner_email, api_key_hash,
		       created_at, last_seen_at, deleted_at
		FROM buddies WHERE id=$1 AND deleted_at IS NULL`, id)
	return scanBuddy(row)
}

// GetByName looks up by unique name.
func (b *BuddyStore) GetByName(ctx context.Context, name string) (Buddy, error) {
	row := b.s.pool.QueryRow(ctx, `
		SELECT id, name, description, acl_mode, acl_group_id, acl_users, owner_email, api_key_hash,
		       created_at, last_seen_at, deleted_at
		FROM buddies WHERE name=$1 AND deleted_at IS NULL`, name)
	return scanBuddy(row)
}

// ListForCaller returns buddies visible to callerEmail respecting ACLs.
// If groups is non-nil, it represents the caller's SSO groups.
func (b *BuddyStore) ListForCaller(ctx context.Context, callerEmail string, groups []string) ([]Buddy, error) {
	rows, err := b.s.pool.Query(ctx, `
		SELECT id, name, description, acl_mode, acl_group_id, acl_users, owner_email, api_key_hash,
		       created_at, last_seen_at, deleted_at
		FROM buddies
		WHERE deleted_at IS NULL AND (
			acl_mode='public'
			OR (acl_mode='users' AND $1 = ANY(acl_users))
			OR (acl_mode='group'  AND acl_group_id = ANY($2))
			OR owner_email=$1
		)
		ORDER BY name ASC`, callerEmail, groups)
	if err != nil {
		return nil, fmt.Errorf("list buddies: %w", err)
	}
	defer rows.Close()
	var out []Buddy
	for rows.Next() {
		buddy, err := scanBuddy(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, buddy)
	}
	return out, rows.Err()
}

// ListAll returns all non-deleted buddies (admin view).
func (b *BuddyStore) ListAll(ctx context.Context) ([]Buddy, error) {
	rows, err := b.s.pool.Query(ctx, `
		SELECT id, name, description, acl_mode, acl_group_id, acl_users, owner_email, api_key_hash,
		       created_at, last_seen_at, deleted_at
		FROM buddies WHERE deleted_at IS NULL ORDER BY name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Buddy
	for rows.Next() {
		buddy, err := scanBuddy(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, buddy)
	}
	return out, rows.Err()
}

// Update mutates description and/or ACL.
func (b *BuddyStore) Update(ctx context.Context, id uuid.UUID, in UpdateBuddy) (Buddy, error) {
	args := []any{id}
	set := ""
	if in.Description != nil {
		args = append(args, *in.Description)
		set += fmt.Sprintf(", description=$%d", len(args))
	}
	if in.ACL != nil {
		args = append(args, in.ACL.Mode, nullable(in.ACL.GroupID), in.ACL.Users)
		set += fmt.Sprintf(", acl_mode=$%d, acl_group_id=$%d, acl_users=$%d", len(args)-2, len(args)-1, len(args))
	}
	if set == "" {
		return b.GetByID(ctx, id)
	}
	q := fmt.Sprintf(`UPDATE buddies SET id=id %s WHERE id=$1 AND deleted_at IS NULL
		RETURNING id, name, description, acl_mode, acl_group_id, acl_users, owner_email, api_key_hash,
		          created_at, last_seen_at, deleted_at`, set)
	row := b.s.pool.QueryRow(ctx, q, args...)
	return scanBuddy(row)
}

// Delete soft-deletes a buddy.
func (b *BuddyStore) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := b.s.pool.Exec(ctx, `UPDATE buddies SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrBuddyNotFound
	}
	return nil
}

// TouchLastSeen updates last_seen_at to NOW().
func (b *BuddyStore) TouchLastSeen(ctx context.Context, id uuid.UUID) error {
	_, err := b.s.pool.Exec(ctx, `UPDATE buddies SET last_seen_at=NOW() WHERE id=$1`, id)
	return err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanBuddy(r rowScanner) (Buddy, error) {
	var b Buddy
	var groupID *string
	err := r.Scan(&b.ID, &b.Name, &b.Description, &b.ACL.Mode, &groupID, &b.ACL.Users,
		&b.OwnerEmail, &b.APIKeyHash, &b.CreatedAt, &b.LastSeenAt, &b.DeletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Buddy{}, ErrBuddyNotFound
	}
	if err != nil {
		return Buddy{}, err
	}
	if groupID != nil {
		b.ACL.GroupID = *groupID
	}
	return b, nil
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
