package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/clawgard/clawgard/server/internal/api"
	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/clawgard/clawgard/server/internal/testsupport"
	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
)

func TestDeviceCodeFlow(t *testing.T) {
	if testing.Short() {
		t.Skip("integration")
	}
	dsn := testsupport.StartPostgres(t)
	ctx := context.Background()
	s, _ := store.Open(ctx, dsn)
	t.Cleanup(func() { s.Close() })
	require.NoError(t, store.Migrate(ctx, s.Pool()))

	r := chi.NewRouter()
	api.MountDeviceCode(r, s, "http://verify.example/device")
	ts := httptest.NewServer(r)
	defer ts.Close()

	// Initiate.
	resp, err := http.Post(ts.URL+"/v1/auth/oidc/device", "application/json", nil)
	require.NoError(t, err)
	defer resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var challenge map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&challenge)
	deviceCode := challenge["deviceCode"].(string)

	// Poll before approval → authorization_pending.
	poll := func() (int, map[string]any) {
		body, _ := json.Marshal(map[string]string{"deviceCode": deviceCode})
		r, _ := http.Post(ts.URL+"/v1/auth/oidc/token", "application/json", bytes.NewReader(body))
		var m map[string]any
		_ = json.NewDecoder(r.Body).Decode(&m)
		r.Body.Close()
		return r.StatusCode, m
	}
	code, m := poll()
	require.Equal(t, http.StatusBadRequest, code)
	require.Equal(t, "authorization_pending", m["code"])

	// Approve synthetically.
	_, err = s.Pool().Exec(ctx,
		`UPDATE device_codes SET approved_email=$1, approved_at=NOW() WHERE device_code=$2`,
		"alice@example.com", deviceCode)
	require.NoError(t, err)

	code, m = poll()
	require.Equal(t, http.StatusOK, code)
	require.NotEmpty(t, m["accessToken"])
	require.Equal(t, "alice@example.com", m["email"])

	// Give it a moment.
	time.Sleep(10 * time.Millisecond)
}
