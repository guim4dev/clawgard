package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/clawgard/clawgard/server/internal/api"
)

type fakeBuddyStore struct {
	owners map[string][]string // email -> owned buddy IDs
}

func (f *fakeBuddyStore) HasBuddiesOwnedBy(email string) (bool, error) {
	return len(f.owners[email]) > 0, nil
}

func TestMeReturnsHatchlingOnly(t *testing.T) {
	signer := api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx"))
	h := api.NewMeHandler(api.MeConfig{
		Signer:      signer,
		AdminEmails: map[string]bool{},
		BuddyStore:  &fakeBuddyStore{},
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	tok, _ := signer.Sign("user@x.io", time.Hour)
	req.AddCookie(&http.Cookie{Name: api.SessionCookieName, Value: tok})
	rw := httptest.NewRecorder()
	h.ServeHTTP(rw, req)

	require.Equal(t, http.StatusOK, rw.Code)
	var body api.MeResponse
	require.NoError(t, json.NewDecoder(rw.Body).Decode(&body))
	assert.Equal(t, "user@x.io", body.Email)
	assert.ElementsMatch(t, []string{"hatchling"}, body.Roles)
}

func TestMeReturnsAdminAndBuddyOwner(t *testing.T) {
	signer := api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx"))
	h := api.NewMeHandler(api.MeConfig{
		Signer:      signer,
		AdminEmails: map[string]bool{"admin@x.io": true},
		BuddyStore:  &fakeBuddyStore{owners: map[string][]string{"admin@x.io": {"b1"}}},
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	tok, _ := signer.Sign("admin@x.io", time.Hour)
	req.AddCookie(&http.Cookie{Name: api.SessionCookieName, Value: tok})
	rw := httptest.NewRecorder()
	h.ServeHTTP(rw, req)

	require.Equal(t, http.StatusOK, rw.Code)
	var body api.MeResponse
	require.NoError(t, json.NewDecoder(rw.Body).Decode(&body))
	assert.ElementsMatch(t, []string{"admin", "buddy_owner", "hatchling"}, body.Roles)
}

func TestMeReturns401WithoutCookie(t *testing.T) {
	signer := api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx"))
	h := api.NewMeHandler(api.MeConfig{
		Signer:      signer,
		AdminEmails: map[string]bool{},
		BuddyStore:  &fakeBuddyStore{},
	})
	req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	rw := httptest.NewRecorder()
	h.ServeHTTP(rw, req)
	assert.Equal(t, http.StatusUnauthorized, rw.Code)
}
