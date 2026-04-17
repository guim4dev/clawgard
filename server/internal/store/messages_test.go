package store_test

import (
	"context"
	"testing"

	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/stretchr/testify/require"
)

func TestAppendMessages(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	s := newStore(t)
	ctx := context.Background()
	b, _ := s.Buddies().Create(ctx, store.NewBuddy{
		Name: "b", OwnerEmail: "o@e.com", APIKeyHash: "h", ACL: store.ACL{Mode: "public"},
	})
	tr, _ := s.Threads().Open(ctx, b.ID, "h@e.com")

	_, err := s.Messages().Append(ctx, store.NewMessage{
		ThreadID: tr.ID, Role: "hatchling", Type: "question", Content: "hi?",
	})
	require.NoError(t, err)
	_, err = s.Messages().Append(ctx, store.NewMessage{
		ThreadID: tr.ID, Role: "buddy", Type: "answer", Content: "hello",
	})
	require.NoError(t, err)

	msgs, err := s.Messages().List(ctx, tr.ID)
	require.NoError(t, err)
	require.Len(t, msgs, 2)
	require.Equal(t, "question", msgs[0].Type)
	require.Equal(t, "answer", msgs[1].Type)
}
