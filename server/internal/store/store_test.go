package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/clawgard/clawgard/server/internal/testsupport"
	"github.com/stretchr/testify/require"
)

func TestOpenPingsPostgres(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test")
	}
	dsn := testsupport.StartPostgres(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	s, err := store.Open(ctx, dsn)
	require.NoError(t, err)
	defer s.Close()

	require.NoError(t, s.Ping(ctx))
}
