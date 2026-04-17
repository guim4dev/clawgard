package store_test

import (
	"context"
	"testing"

	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/clawgard/clawgard/server/internal/testsupport"
	"github.com/stretchr/testify/require"
)

func newStore(t *testing.T) *store.Store {
	t.Helper()
	dsn := testsupport.StartPostgres(t)
	ctx := context.Background()
	s, err := store.Open(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(func() { s.Close() })
	require.NoError(t, store.Migrate(ctx, s.Pool()))
	return s
}

func TestCreateAndGetBuddy(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test")
	}
	s := newStore(t)
	ctx := context.Background()

	b, err := s.Buddies().Create(ctx, store.NewBuddy{
		Name:        "jean",
		Description: "billing expert",
		OwnerEmail:  "jean@example.com",
		ACL:         store.ACL{Mode: "public"},
		APIKeyHash:  "$2a$12$somehash",
	})
	require.NoError(t, err)
	require.NotEmpty(t, b.ID)

	got, err := s.Buddies().Get(ctx, b.ID)
	require.NoError(t, err)
	require.Equal(t, "jean", got.Name)
	require.Equal(t, "billing expert", got.Description)
	require.Equal(t, "public", got.ACL.Mode)
}

func TestListBuddiesForCaller(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test")
	}
	s := newStore(t)
	ctx := context.Background()

	_, err := s.Buddies().Create(ctx, store.NewBuddy{
		Name: "pub", OwnerEmail: "o@e.com", APIKeyHash: "h",
		ACL: store.ACL{Mode: "public"},
	})
	require.NoError(t, err)
	_, err = s.Buddies().Create(ctx, store.NewBuddy{
		Name: "priv", OwnerEmail: "o@e.com", APIKeyHash: "h",
		ACL: store.ACL{Mode: "users", Users: []string{"allowed@e.com"}},
	})
	require.NoError(t, err)

	visible, err := s.Buddies().ListForCaller(ctx, "stranger@e.com", nil)
	require.NoError(t, err)
	require.Len(t, visible, 1)
	require.Equal(t, "pub", visible[0].Name)

	visible, err = s.Buddies().ListForCaller(ctx, "allowed@e.com", nil)
	require.NoError(t, err)
	require.Len(t, visible, 2)
}

func TestGetByAPIKeyHashLookup(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test")
	}
	s := newStore(t)
	ctx := context.Background()

	created, err := s.Buddies().Create(ctx, store.NewBuddy{
		Name: "x", OwnerEmail: "o@e.com", APIKeyHash: "h1",
		ACL: store.ACL{Mode: "public"},
	})
	require.NoError(t, err)

	b, err := s.Buddies().GetByID(ctx, created.ID)
	require.NoError(t, err)
	require.Equal(t, "h1", b.APIKeyHash)
}

func TestTouchLastSeen(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test")
	}
	s := newStore(t)
	ctx := context.Background()

	b, err := s.Buddies().Create(ctx, store.NewBuddy{
		Name: "touched", OwnerEmail: "o@e.com", APIKeyHash: "h",
		ACL: store.ACL{Mode: "public"},
	})
	require.NoError(t, err)
	require.NoError(t, s.Buddies().TouchLastSeen(ctx, b.ID))

	got, err := s.Buddies().GetByID(ctx, b.ID)
	require.NoError(t, err)
	require.NotNil(t, got.LastSeenAt)
}
