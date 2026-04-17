package auth_test

import (
	"context"
	"testing"

	"github.com/clawgard/clawgard/server/internal/auth"
	"github.com/clawgard/clawgard/server/internal/testsupport"
	"github.com/stretchr/testify/require"
)

func TestOIDCVerify(t *testing.T) {
	idp := testsupport.StartFakeIDP(t)

	v, err := auth.NewOIDCVerifier(context.Background(), auth.OIDCConfig{
		Issuer:   idp.Server.URL,
		Audience: "clawgard",
	})
	require.NoError(t, err)

	token := idp.IssueToken(t, "alice@example.com", "clawgard")
	claims, err := v.Verify(context.Background(), token)
	require.NoError(t, err)
	require.Equal(t, "alice@example.com", claims.Email)
	require.Equal(t, "alice@example.com", claims.Subject)
}

func TestOIDCVerifyRejectsWrongAudience(t *testing.T) {
	idp := testsupport.StartFakeIDP(t)
	v, _ := auth.NewOIDCVerifier(context.Background(), auth.OIDCConfig{
		Issuer: idp.Server.URL, Audience: "clawgard",
	})
	token := idp.IssueToken(t, "eve@example.com", "someone-else")
	_, err := v.Verify(context.Background(), token)
	require.Error(t, err)
}
