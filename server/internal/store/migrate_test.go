package store_test

import (
	"context"
	"testing"

	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/clawgard/clawgard/server/internal/testsupport"
	"github.com/stretchr/testify/require"
)

func TestMigrateAppliesAllMigrations(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test")
	}
	dsn := testsupport.StartPostgres(t)
	ctx := context.Background()

	s, err := store.Open(ctx, dsn)
	require.NoError(t, err)
	defer s.Close()

	require.NoError(t, store.Migrate(ctx, s.Pool()))

	// All expected tables exist.
	for _, table := range []string{"schema_migrations", "buddies", "threads", "messages", "device_codes"} {
		var exists bool
		err := s.Pool().QueryRow(ctx, `SELECT EXISTS (
			SELECT FROM pg_tables WHERE schemaname='public' AND tablename=$1)`, table).Scan(&exists)
		require.NoError(t, err)
		require.Truef(t, exists, "table %q missing", table)
	}
}

func TestMigrateIsIdempotent(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test")
	}
	dsn := testsupport.StartPostgres(t)
	ctx := context.Background()

	s, err := store.Open(ctx, dsn)
	require.NoError(t, err)
	defer s.Close()

	require.NoError(t, store.Migrate(ctx, s.Pool()))
	require.NoError(t, store.Migrate(ctx, s.Pool())) // second run must be a no-op
}
