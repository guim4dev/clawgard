package testsupport

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
)

// FakeIDP is a minimal OIDC IdP that exposes JWKS and can issue signed tokens.
type FakeIDP struct {
	Server *httptest.Server
	Key    *rsa.PrivateKey
	KID    string
}

// StartFakeIDP boots an IdP at a random port, serves /.well-known/jwks.json.
func StartFakeIDP(t *testing.T) *FakeIDP {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	idp := &FakeIDP{Key: key, KID: "test-kid"}
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/jwks.json", func(w http.ResponseWriter, _ *http.Request) {
		n := base64.RawURLEncoding.EncodeToString(key.N.Bytes())
		e := base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())
		resp := map[string]any{
			"keys": []any{
				map[string]any{
					"kty": "RSA", "alg": "RS256", "use": "sig",
					"kid": idp.KID, "n": n, "e": e,
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})
	idp.Server = httptest.NewServer(mux)
	t.Cleanup(idp.Server.Close)
	return idp
}

// IssueToken signs a JWT with the FakeIDP's key.
func (i *FakeIDP) IssueToken(t *testing.T, subject, audience string) string {
	t.Helper()
	claims := jwt.RegisteredClaims{
		Issuer:    i.Server.URL,
		Subject:   subject,
		Audience:  jwt.ClaimStrings{audience},
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Hour)),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, struct {
		jwt.RegisteredClaims
		Email string `json:"email"`
	}{claims, subject})
	tok.Header["kid"] = i.KID
	signed, err := tok.SignedString(i.Key)
	require.NoError(t, err)
	return signed
}
