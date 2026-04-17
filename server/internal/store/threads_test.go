package store_test

import (
	"context"
	"testing"

	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/stretchr/testify/require"
)

func TestOpenThread(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	s := newStore(t)
	ctx := context.Background()
	b, _ := s.Buddies().Create(ctx, store.NewBuddy{
		Name: "b", OwnerEmail: "o@e.com", APIKeyHash: "h", ACL: store.ACL{Mode: "public"},
	})

	tr, err := s.Threads().Open(ctx, b.ID, "hatch@e.com")
	require.NoError(t, err)
	require.Equal(t, "open", tr.Status)
	require.Equal(t, 0, tr.Turns)
}

func TestCloseThread(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	s := newStore(t)
	ctx := context.Background()
	b, _ := s.Buddies().Create(ctx, store.NewBuddy{
		Name: "b", OwnerEmail: "o@e.com", APIKeyHash: "h", ACL: store.ACL{Mode: "public"},
	})
	tr, _ := s.Threads().Open(ctx, b.ID, "hatch@e.com")

	require.NoError(t, s.Threads().Close(ctx, tr.ID, "hatchling_closed"))

	got, _ := s.Threads().Get(ctx, tr.ID)
	require.Equal(t, "closed", got.Status)
	require.NotNil(t, got.ClosedAt)
	require.Equal(t, "hatchling_closed", got.CloseReason)
}

func TestIncrementTurnsRejectsOverCap(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	s := newStore(t)
	ctx := context.Background()
	b, _ := s.Buddies().Create(ctx, store.NewBuddy{
		Name: "b", OwnerEmail: "o@e.com", APIKeyHash: "h", ACL: store.ACL{Mode: "public"},
	})
	tr, _ := s.Threads().Open(ctx, b.ID, "h@e.com")

	for i := 0; i < 3; i++ {
		n, err := s.Threads().IncrementTurns(ctx, tr.ID)
		require.NoError(t, err, "turn %d", i)
		require.Equal(t, i+1, n)
	}
	_, err := s.Threads().IncrementTurns(ctx, tr.ID)
	require.ErrorIs(t, err, store.ErrTurnCapExceeded)
}
