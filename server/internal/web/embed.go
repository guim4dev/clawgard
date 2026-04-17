// Package web embeds the compiled Vue SPA from server/web/dist and serves it
// with SPA-fallback semantics. API paths (/v1/*, /auth/*) are rejected here
// with 404 as a defense-in-depth measure even though the outer router already
// mounts them first.
package web

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed all:dist
var distFS embed.FS

const csp = "default-src 'self'; " +
	"script-src 'self'; " +
	// Naive UI injects runtime styles; 'unsafe-inline' required for style-src only.
	"style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data:; " +
	"font-src 'self' data:; " +
	"connect-src 'self'; " +
	"frame-ancestors 'none'; " +
	"base-uri 'self'; " +
	"form-action 'self'"

// Handler returns an http.Handler that serves the embedded SPA with fallback
// to index.html for unknown paths. Requests whose path begins with /v1/ or
// /auth/ are rejected with 404.
func Handler() http.Handler {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}
	staticFS := http.FileServer(http.FS(sub))
	index, err := fs.ReadFile(sub, "index.html")
	if err != nil {
		panic("embedded SPA missing index.html: " + err.Error())
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if strings.HasPrefix(p, "/v1/") || strings.HasPrefix(p, "/auth/") {
			http.NotFound(w, r)
			return
		}

		// Long-cache fingerprinted assets; Vite emits them under /assets/.
		if strings.HasPrefix(p, "/assets/") {
			if f, err := sub.Open(strings.TrimPrefix(p, "/")); err == nil {
				_ = f.Close()
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				staticFS.ServeHTTP(w, r)
				return
			}
		}

		// If the requested path exists in the embedded FS (e.g. /favicon.ico), serve it.
		cleaned := strings.TrimPrefix(p, "/")
		if cleaned != "" {
			if f, err := sub.Open(cleaned); err == nil {
				_ = f.Close()
				staticFS.ServeHTTP(w, r)
				return
			}
		}

		// SPA fallback: write index.html with CSP.
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Security-Policy", csp)
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(index)
	})
}
