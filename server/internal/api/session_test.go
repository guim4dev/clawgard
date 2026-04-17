package api_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/clawgard/clawgard/server/internal/api"
)

func TestSessionSignVerifyRoundtrip(t *testing.T) {
	s := api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx"))
	token, err := s.Sign("user@example.com", time.Hour)
	require.NoError(t, err)

	email, err := s.Verify(token)
	require.NoError(t, err)
	assert.Equal(t, "user@example.com", email)
}

func TestSessionRejectsTamperedToken(t *testing.T) {
	s := api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx"))
	token, _ := s.Sign("user@example.com", time.Hour)
	tampered := token[:len(token)-2] + "xx"
	_, err := s.Verify(tampered)
	assert.ErrorIs(t, err, api.ErrInvalidSession)
}

func TestSessionRejectsExpired(t *testing.T) {
	s := api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx"))
	token, _ := s.Sign("user@example.com", -time.Second)
	_, err := s.Verify(token)
	assert.ErrorIs(t, err, api.ErrSessionExpired)
}

func TestSetCookieIsHttpOnlyAndSecureInProd(t *testing.T) {
	s := api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx"))
	rw := httptest.NewRecorder()
	s.SetCookie(rw, "user@example.com", time.Hour, false /* dev=false */)
	setCookie := rw.Header().Get("Set-Cookie")
	require.NotEmpty(t, setCookie)
	assert.True(t, strings.Contains(setCookie, "HttpOnly"))
	assert.True(t, strings.Contains(setCookie, "Secure"))
	assert.True(t, strings.Contains(setCookie, "SameSite=Lax"))
}

func TestSetCookieOmitsSecureInDev(t *testing.T) {
	s := api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx"))
	rw := httptest.NewRecorder()
	s.SetCookie(rw, "user@example.com", time.Hour, true /* dev=true */)
	setCookie := rw.Header().Get("Set-Cookie")
	assert.True(t, strings.Contains(setCookie, "HttpOnly"))
	assert.False(t, strings.Contains(setCookie, "Secure"))
}

func TestReadCookieReturnsEmailFromRequest(t *testing.T) {
	s := api.NewSessionSigner([]byte("test-secret-32-bytes-xxxxxxxxxxxx"))
	token, _ := s.Sign("user@example.com", time.Hour)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: "clawgard_session", Value: token})
	email, err := s.Read(req)
	require.NoError(t, err)
	assert.Equal(t, "user@example.com", email)
}
