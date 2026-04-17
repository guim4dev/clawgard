package api_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/clawgard/clawgard/server/internal/api"
	"github.com/clawgard/clawgard/server/internal/auth"
	"github.com/clawgard/clawgard/server/internal/testsupport"
	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
)

func TestHatchlingOIDCMiddlewareSetsIdentity(t *testing.T) {
	idp := testsupport.StartFakeIDP(t)
	v, err := auth.NewOIDCVerifier(context.Background(), auth.OIDCConfig{
		Issuer: idp.Server.URL, Audience: "clawgard",
	})
	require.NoError(t, err)

	r := chi.NewRouter()
	r.Use(api.HatchlingOIDCMiddleware(v))
	r.Get("/who", func(w http.ResponseWriter, req *http.Request) {
		id, _ := api.IdentityFromContext(req.Context())
		_, _ = w.Write([]byte(id.Email))
	})

	ts := httptest.NewServer(r)
	defer ts.Close()

	tok := idp.IssueToken(t, "alice@example.com", "clawgard")
	req, _ := http.NewRequest("GET", ts.URL+"/who", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestHatchlingOIDCMiddlewareRejectsMissing(t *testing.T) {
	r := chi.NewRouter()
	r.Use(api.HatchlingOIDCMiddleware(nil)) // nil verifier → always 401
	r.Get("/who", func(http.ResponseWriter, *http.Request) {})
	ts := httptest.NewServer(r)
	defer ts.Close()
	resp, _ := http.Get(ts.URL + "/who")
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}
