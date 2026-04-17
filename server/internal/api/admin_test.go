package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/clawgard/clawgard/server/internal/api"
	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/clawgard/clawgard/server/internal/testsupport"
	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
)

func TestAdminCreateAndListBuddy(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	dsn := testsupport.StartPostgres(t)
	ctx := context.Background()
	s, _ := store.Open(ctx, dsn)
	t.Cleanup(func() { s.Close() })
	require.NoError(t, store.Migrate(ctx, s.Pool()))

	r := chi.NewRouter()
	r.Use(func(h http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			req = req.WithContext(api.WithIdentity(req.Context(),
				api.Identity{Email: "admin@clawgard.test", Admin: true}))
			h.ServeHTTP(w, req)
		})
	})
	api.MountAdmin(r, s)

	ts := httptest.NewServer(r)
	defer ts.Close()

	body, _ := json.Marshal(map[string]any{
		"name":        "jean",
		"description": "billing",
		"acl":         map[string]any{"mode": "public"},
	})
	resp, err := http.Post(ts.URL+"/v1/admin/buddies", "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var created struct {
		Buddy struct {
			ID   string
			Name string
		}
		APIKey string `json:"apiKey"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&created))
	require.Equal(t, "jean", created.Buddy.Name)
	require.NotEmpty(t, created.APIKey)

	// List
	resp2, err := http.Get(ts.URL + "/v1/admin/buddies")
	require.NoError(t, err)
	defer resp2.Body.Close()
	require.Equal(t, http.StatusOK, resp2.StatusCode)
	var list []map[string]any
	require.NoError(t, json.NewDecoder(resp2.Body).Decode(&list))
	require.Len(t, list, 1)
}

func TestAdminRequiresIdentity(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	dsn := testsupport.StartPostgres(t)
	s, _ := store.Open(context.Background(), dsn)
	t.Cleanup(func() { s.Close() })
	require.NoError(t, store.Migrate(context.Background(), s.Pool()))

	r := chi.NewRouter()
	// No identity injector; admin mount must reject with 401.
	api.MountAdmin(r, s)

	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/v1/admin/buddies")
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}
