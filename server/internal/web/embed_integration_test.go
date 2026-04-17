//go:build integration

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

// TestRealBuildServesHashedAssets must be run AFTER `make dashboard-build` so
// that server/web/dist/ contains the fingerprinted Vite output the handler
// expects to embed. It fetches /, pulls the first /assets/ reference out of
// the real index.html, and requests that asset with the long-cache header.
func TestRealBuildServesHashedAssets(t *testing.T) {
	srv := httptest.NewServer(web.Handler())
	defer srv.Close()

	res, err := http.Get(srv.URL + "/")
	require.NoError(t, err)
	defer res.Body.Close()
	require.Equal(t, http.StatusOK, res.StatusCode)

	buf := make([]byte, 32*1024)
	n, _ := res.Body.Read(buf)
	body := string(buf[:n])
	idx := strings.Index(body, "/assets/")
	require.GreaterOrEqual(t, idx, 0, "built index.html must reference /assets/")
	end := strings.IndexAny(body[idx:], "\"' ")
	require.Greater(t, end, 0)
	asset := body[idx : idx+end]

	res2, err := http.Get(srv.URL + asset)
	require.NoError(t, err)
	defer res2.Body.Close()
	assert.Equal(t, http.StatusOK, res2.StatusCode)
	assert.Equal(t, "public, max-age=31536000, immutable", res2.Header.Get("Cache-Control"))
}
