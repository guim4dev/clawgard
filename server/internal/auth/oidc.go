package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

type OIDCConfig struct {
	Issuer   string
	Audience string
}

type OIDCVerifier struct {
	cfg OIDCConfig
	kf  keyfunc.Keyfunc
}

type OIDCClaims struct {
	Email   string   `json:"email"`
	Subject string   `json:"sub"`
	Groups  []string `json:"groups,omitempty"`
}

func NewOIDCVerifier(ctx context.Context, cfg OIDCConfig) (*OIDCVerifier, error) {
	if cfg.Issuer == "" {
		return nil, errors.New("oidc issuer required")
	}
	kf, err := keyfunc.NewDefaultCtx(ctx, []string{cfg.Issuer + "/.well-known/jwks.json"})
	if err != nil {
		return nil, fmt.Errorf("fetch JWKS: %w", err)
	}
	return &OIDCVerifier{cfg: cfg, kf: kf}, nil
}

func (v *OIDCVerifier) Verify(_ context.Context, raw string) (OIDCClaims, error) {
	type claims struct {
		jwt.RegisteredClaims
		Email  string   `json:"email"`
		Groups []string `json:"groups,omitempty"`
	}
	tok, err := jwt.ParseWithClaims(raw, &claims{}, v.kf.Keyfunc,
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer(v.cfg.Issuer),
		jwt.WithAudience(v.cfg.Audience),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return OIDCClaims{}, err
	}
	c, ok := tok.Claims.(*claims)
	if !ok || !tok.Valid {
		return OIDCClaims{}, errors.New("invalid token")
	}
	email := c.Email
	if email == "" {
		email = c.Subject
	}
	return OIDCClaims{Email: email, Subject: c.Subject, Groups: c.Groups}, nil
}
