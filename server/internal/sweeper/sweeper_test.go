package sweeper_test

import (
	"context"
	"testing"
	"time"

	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/clawgard/clawgard/server/internal/sweeper"
	"github.com/clawgard/clawgard/server/internal/testsupport"
	"github.com/stretchr/testify/require"
)

func TestSweeperClosesIdleThreads(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	dsn := testsupport.StartPostgres(t)
	ctx := context.Background()
	s, _ := store.Open(ctx, dsn)
	t.Cleanup(func() { s.Close() })
	require.NoError(t, store.Migrate(ctx, s.Pool()))

	b, _ := s.Buddies().Create(ctx, store.NewBuddy{
		Name: "b", OwnerEmail: "o@e.com", APIKeyHash: "h", ACL: store.ACL{Mode: "public"},
	})
	th, _ := s.Threads().Open(ctx, b.ID, "h@e.com")

	// Manually backdate the thread's last activity.
	_, err := s.Pool().Exec(ctx, `UPDATE threads SET last_activity_at = NOW() - INTERVAL '1 hour' WHERE id=$1`, th.ID)
	require.NoError(t, err)

	sw := sweeper.New(s, 1*time.Second, 1*time.Second)
	sw.RunOnce(ctx)

	got, _ := s.Threads().Get(ctx, th.ID)
	require.Equal(t, "closed", got.Status)
	require.Equal(t, "idle_timeout", got.CloseReason)
}
