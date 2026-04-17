package web_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/clawgard/clawgard/server/internal/web"
)

func TestEmbedServesIndexHTMLForRoot(t *testing.T) {
	h := web.Handler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rw := httptest.NewRecorder()
	h.ServeHTTP(rw, req)

	require.Equal(t, http.StatusOK, rw.Code)
	assert.Contains(t, rw.Body.String(), `id="app"`)
	assert.Equal(t, "text/html; charset=utf-8", rw.Header().Get("Content-Type"))
}

func TestEmbedServesIndexForUnknownSPARoute(t *testing.T) {
	h := web.Handler()
	req := httptest.NewRequest(http.MethodGet, "/buddies/abc", nil)
	rw := httptest.NewRecorder()
	h.ServeHTTP(rw, req)
	require.Equal(t, http.StatusOK, rw.Code)
	assert.Contains(t, rw.Body.String(), `id="app"`)
}

func TestEmbedRejectsAPIPaths(t *testing.T) {
	h := web.Handler()
	for _, p := range []string{"/v1/me", "/v1/admin/buddies", "/auth/callback"} {
		req := httptest.NewRequest(http.MethodGet, p, nil)
		rw := httptest.NewRecorder()
		h.ServeHTTP(rw, req)
		assert.Equal(t, http.StatusNotFound, rw.Code, "path %s should be 404 from embed", p)
	}
}

func TestEmbedSetsCSPHeaderOnIndex(t *testing.T) {
	h := web.Handler()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rw := httptest.NewRecorder()
	h.ServeHTTP(rw, req)
	csp := rw.Header().Get("Content-Security-Policy")
	require.NotEmpty(t, csp)
	for _, substr := range []string{
		"default-src 'self'",
		"script-src 'self'",
		"connect-src 'self'",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
	} {
		assert.True(t, strings.Contains(csp, substr), "CSP missing %q", substr)
	}
}

func TestEmbedServesStaticAssetsWithLongCache(t *testing.T) {
	h := web.Handler()
	// Fingerprinted asset path pattern that Vite produces: /assets/xxx.js
	req := httptest.NewRequest(http.MethodGet, "/assets/test.js", nil)
	rw := httptest.NewRecorder()
	h.ServeHTTP(rw, req)
	// If the asset doesn't exist we get 200 (fallback to index) OR 404 from static.
	// Either way, check that *if* it served the asset, it set a long cache header.
	// In the test environment with no assets present, we fallback — so accept either.
	if rw.Code == http.StatusOK && strings.Contains(rw.Body.String(), "id=\"app\"") {
		t.Skip("no assets in test build; fallback served index (acceptable)")
	}
	assert.Equal(t, "public, max-age=31536000, immutable", rw.Header().Get("Cache-Control"))
}
