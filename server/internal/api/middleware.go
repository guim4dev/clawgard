package api

import (
	"context"
	"net/http"
	"strings"

	"github.com/clawgard/clawgard/server/internal/auth"
)

type ctxKey string

const identityKey ctxKey = "identity"

// Identity represents the authenticated caller of a request.
type Identity struct {
	Email  string
	Groups []string
	Admin  bool
	// BuddyID is set when the caller is a buddy (WebSocket auth).
	BuddyID string
}

// WithIdentity injects an Identity into ctx (used in tests and by the ws auth).
func WithIdentity(ctx context.Context, id Identity) context.Context {
	return context.WithValue(ctx, identityKey, id)
}

// IdentityFromContext returns the caller's identity if present.
func IdentityFromContext(ctx context.Context) (Identity, bool) {
	id, ok := ctx.Value(identityKey).(Identity)
	return id, ok
}

// HatchlingOIDCMiddleware validates the Authorization: Bearer <JWT> and populates the identity.
func HatchlingOIDCMiddleware(v *auth.OIDCVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if v == nil {
				writeError(w, http.StatusUnauthorized, "unauthorized", "oidc not configured")
				return
			}
			h := r.Header.Get("Authorization")
			if !strings.HasPrefix(h, "Bearer ") {
				writeError(w, http.StatusUnauthorized, "unauthorized", "missing bearer token")
				return
			}
			claims, err := v.Verify(r.Context(), strings.TrimPrefix(h, "Bearer "))
			if err != nil {
				writeError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
				return
			}
			id := Identity{Email: claims.Email, Groups: claims.Groups}
			r = r.WithContext(WithIdentity(r.Context(), id))
			next.ServeHTTP(w, r)
		})
	}
}

// AdminMiddleware wraps HatchlingOIDC and additionally:
//   - in dev-mode, accepts Authorization: Bearer <devAdminKey> and synthesises an admin identity
//   - otherwise, requires a group in the admin-group list (configurable)
//
// adminGroups may be empty; in that case only the devAdminKey path yields admin.
func AdminMiddleware(v *auth.OIDCVerifier, devAdminKey string, adminGroups []string) func(http.Handler) http.Handler {
	return AdminMiddlewareWithSession(v, devAdminKey, adminGroups, nil, nil)
}

// AdminMiddlewareWithSession extends AdminMiddleware with an optional session-cookie
// path for the dashboard: a signed session cookie resolving to an email in
// adminEmails is accepted as an admin identity. Bearer paths are preserved so
// buddy-cli and OIDC hatchling/admin flows keep working unchanged.
func AdminMiddlewareWithSession(
	v *auth.OIDCVerifier,
	devAdminKey string,
	adminGroups []string,
	signer *SessionSigner,
	adminEmails map[string]bool,
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if signer != nil && len(adminEmails) > 0 {
				if email, err := signer.Read(r); err == nil && adminEmails[email] {
					id := Identity{Email: email, Admin: true}
					r = r.WithContext(WithIdentity(r.Context(), id))
					next.ServeHTTP(w, r)
					return
				}
			}
			authz := r.Header.Get("Authorization")
			if devAdminKey != "" && authz == "Bearer "+devAdminKey {
				id := Identity{Email: "admin@clawgard.test", Admin: true}
				r = r.WithContext(WithIdentity(r.Context(), id))
				next.ServeHTTP(w, r)
				return
			}
			if v == nil || !strings.HasPrefix(authz, "Bearer ") {
				writeError(w, http.StatusUnauthorized, "unauthorized", "admin auth required")
				return
			}
			claims, err := v.Verify(r.Context(), strings.TrimPrefix(authz, "Bearer "))
			if err != nil {
				writeError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
				return
			}
			if !hasAnyGroup(claims.Groups, adminGroups) {
				writeError(w, http.StatusForbidden, "forbidden", "not an admin")
				return
			}
			id := Identity{Email: claims.Email, Groups: claims.Groups, Admin: true}
			r = r.WithContext(WithIdentity(r.Context(), id))
			next.ServeHTTP(w, r)
		})
	}
}

func hasAnyGroup(have, want []string) bool {
	if len(want) == 0 {
		return false
	}
	set := make(map[string]struct{}, len(have))
	for _, g := range have {
		set[g] = struct{}{}
	}
	for _, g := range want {
		if _, ok := set[g]; ok {
			return true
		}
	}
	return false
}
