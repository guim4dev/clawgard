package api_test

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/clawgard/clawgard/server/internal/api"
)

// mockIdP emits canned responses for the authorization_code flow with PKCE.
type mockIdP struct {
	server    *httptest.Server
	wantCode  string
	wantEmail string
}

func newMockIdP(t *testing.T, code, email string) *mockIdP {
	m := &mockIdP{wantCode: code, wantEmail: email}
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.Form.Get("code") != m.wantCode {
			http.Error(w, "bad code", http.StatusBadRequest)
			return
		}
		if r.Form.Get("code_verifier") == "" {
			http.Error(w, "missing code_verifier", http.StatusBadRequest)
			return
		}
		payload := `{"email":"` + m.wantEmail + `","sub":"abc"}`
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"at","id_token":"header.` +
			base64URL(payload) + `.sig","token_type":"Bearer","expires_in":3600}`))
	})
	m.server = httptest.NewServer(mux)
	t.Cleanup(m.server.Close)
	return m
}

func base64URL(s string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(s))
}

func TestCallbackSuccessSetsSessionCookie(t *testing.T) {
	idp := newMockIdP(t, "good-code", "admin@example.com")
	handler := api.NewAuthHandler(api.AuthConfig{
		IdPTokenURL:  idp.server.URL + "/token",
		ClientID:     "cid",
		ClientSecret: "csec",
		RedirectURL:  "http://localhost:8080/auth/callback",
		Signer:       api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx")),
		Dev:          true,
		StateStore:   api.NewMemoryStateStore(),
	})

	state, verifier := handler.StartFlow(context.Background(), "/buddies")

	req := httptest.NewRequest(http.MethodGet, "/auth/callback?code=good-code&state="+state, nil)
	rw := httptest.NewRecorder()
	handler.Callback(rw, req)

	require.Equal(t, http.StatusFound, rw.Code)
	assert.Equal(t, "/buddies", rw.Header().Get("Location"))
	cookies := rw.Result().Cookies()
	var session *http.Cookie
	for _, c := range cookies {
		if c.Name == api.SessionCookieName {
			session = c
		}
	}
	require.NotNil(t, session)
	assert.True(t, session.HttpOnly)
	_ = verifier
}

func TestCallbackRejectsUnknownState(t *testing.T) {
	handler := api.NewAuthHandler(api.AuthConfig{
		Signer:     api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx")),
		StateStore: api.NewMemoryStateStore(),
		Dev:        true,
	})
	req := httptest.NewRequest(http.MethodGet, "/auth/callback?code=c&state=nope", nil)
	rw := httptest.NewRecorder()
	handler.Callback(rw, req)
	assert.Equal(t, http.StatusBadRequest, rw.Code)
}

func TestCallbackRejectsExpiredState(t *testing.T) {
	store := api.NewMemoryStateStore()
	store.SetTTL(1 * time.Millisecond)
	handler := api.NewAuthHandler(api.AuthConfig{
		Signer:     api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx")),
		StateStore: store,
		Dev:        true,
	})
	state, _ := handler.StartFlow(context.Background(), "/buddies")
	time.Sleep(10 * time.Millisecond)
	req := httptest.NewRequest(http.MethodGet, "/auth/callback?code=c&state="+state, nil)
	rw := httptest.NewRecorder()
	handler.Callback(rw, req)
	assert.Equal(t, http.StatusBadRequest, rw.Code)
}

func TestCallbackRejectsIdPError(t *testing.T) {
	idp := newMockIdP(t, "only-this", "x@x")
	handler := api.NewAuthHandler(api.AuthConfig{
		IdPTokenURL:  idp.server.URL + "/token",
		ClientID:     "cid",
		ClientSecret: "csec",
		RedirectURL:  "http://localhost:8080/auth/callback",
		Signer:       api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx")),
		StateStore:   api.NewMemoryStateStore(),
		Dev:          true,
	})
	state, _ := handler.StartFlow(context.Background(), "/buddies")
	req := httptest.NewRequest(http.MethodGet, "/auth/callback?code=wrong&state="+state, nil)
	rw := httptest.NewRecorder()
	handler.Callback(rw, req)
	assert.Equal(t, http.StatusBadGateway, rw.Code)
}

func TestLoginRedirectsToIdP(t *testing.T) {
	handler := api.NewAuthHandler(api.AuthConfig{
		IdPAuthURL:  "https://idp.example.com/authorize",
		ClientID:    "cid",
		RedirectURL: "http://localhost:8080/auth/callback",
		Signer:      api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx")),
		StateStore:  api.NewMemoryStateStore(),
		Dev:         true,
	})
	req := httptest.NewRequest(http.MethodGet, "/auth/login?redirect=/buddies", nil)
	rw := httptest.NewRecorder()
	handler.Login(rw, req)
	require.Equal(t, http.StatusFound, rw.Code)
	loc, _ := url.Parse(rw.Header().Get("Location"))
	assert.Equal(t, "idp.example.com", loc.Host)
	assert.NotEmpty(t, loc.Query().Get("state"))
	assert.Equal(t, "S256", loc.Query().Get("code_challenge_method"))
	assert.NotEmpty(t, loc.Query().Get("code_challenge"))
}

func TestLogoutClearsCookie(t *testing.T) {
	handler := api.NewAuthHandler(api.AuthConfig{
		Signer:     api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx")),
		StateStore: api.NewMemoryStateStore(),
		Dev:        true,
	})
	req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	rw := httptest.NewRecorder()
	handler.Logout(rw, req)
	assert.Equal(t, http.StatusNoContent, rw.Code)
	var cleared bool
	for _, c := range rw.Result().Cookies() {
		if c.Name == api.SessionCookieName && c.MaxAge < 0 {
			cleared = true
		}
	}
	assert.True(t, cleared)
}

func TestStartFlowReturnsDistinctValues(t *testing.T) {
	handler := api.NewAuthHandler(api.AuthConfig{
		Signer:     api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx")),
		StateStore: api.NewMemoryStateStore(),
		Dev:        true,
	})
	s1, v1 := handler.StartFlow(context.Background(), "/a")
	s2, v2 := handler.StartFlow(context.Background(), "/b")
	assert.NotEqual(t, s1, s2)
	assert.NotEqual(t, v1, v2)
	assert.Len(t, v1, 43) // base64url(32 bytes)
}
