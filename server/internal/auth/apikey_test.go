package auth_test

import (
	"testing"

	"github.com/clawgard/clawgard/server/internal/auth"
	"github.com/stretchr/testify/require"
)

func TestGenerateAPIKeyIsURLSafeAndUnique(t *testing.T) {
	a, err := auth.GenerateAPIKey()
	require.NoError(t, err)
	b, err := auth.GenerateAPIKey()
	require.NoError(t, err)
	require.NotEqual(t, a, b)
	require.Len(t, a, auth.APIKeyLength)
}

func TestHashAndVerifyAPIKey(t *testing.T) {
	key, err := auth.GenerateAPIKey()
	require.NoError(t, err)

	hash, err := auth.HashAPIKey(key)
	require.NoError(t, err)
	require.NotEqual(t, key, hash)

	require.NoError(t, auth.VerifyAPIKey(hash, key))
	require.Error(t, auth.VerifyAPIKey(hash, "wrong-key"))
}
