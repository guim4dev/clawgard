package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type StateStore interface {
	Put(state string, data StateData) error
	Take(state string) (StateData, bool)
}

type StateData struct {
	Verifier  string
	Redirect  string
	CreatedAt time.Time
}

type memoryStateStore struct {
	mu  sync.Mutex
	m   map[string]StateData
	ttl time.Duration
}

func NewMemoryStateStore() *memoryStateStore {
	return &memoryStateStore{m: map[string]StateData{}, ttl: 10 * time.Minute}
}

func (s *memoryStateStore) SetTTL(ttl time.Duration) { s.ttl = ttl }

func (s *memoryStateStore) Put(state string, d StateData) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.m[state] = d
	return nil
}

func (s *memoryStateStore) Take(state string) (StateData, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d, ok := s.m[state]
	if !ok {
		return StateData{}, false
	}
	delete(s.m, state)
	if time.Since(d.CreatedAt) > s.ttl {
		return StateData{}, false
	}
	return d, true
}

type AuthConfig struct {
	IdPAuthURL   string
	IdPTokenURL  string
	ClientID     string
	ClientSecret string
	RedirectURL  string
	Scopes       []string
	Signer       *SessionSigner
	StateStore   StateStore
	SessionTTL   time.Duration
	Dev          bool
	HTTPClient   *http.Client
}

type AuthHandler struct {
	cfg AuthConfig
}

func NewAuthHandler(cfg AuthConfig) *AuthHandler {
	if cfg.SessionTTL == 0 {
		cfg.SessionTTL = 8 * time.Hour
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = http.DefaultClient
	}
	if len(cfg.Scopes) == 0 {
		cfg.Scopes = []string{"openid", "email", "profile"}
	}
	return &AuthHandler{cfg: cfg}
}

func (h *AuthHandler) StartFlow(_ context.Context, redirect string) (state, verifier string) {
	verifier = randomBase64URL(32)
	state = randomBase64URL(16)
	_ = h.cfg.StateStore.Put(state, StateData{Verifier: verifier, Redirect: redirect, CreatedAt: time.Now()})
	return state, verifier
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	redirect := r.URL.Query().Get("redirect")
	if redirect == "" {
		redirect = "/"
	}
	state, verifier := h.StartFlow(r.Context(), redirect)
	challenge := codeChallengeS256(verifier)

	q := url.Values{}
	q.Set("client_id", h.cfg.ClientID)
	q.Set("redirect_uri", h.cfg.RedirectURL)
	q.Set("response_type", "code")
	q.Set("scope", strings.Join(h.cfg.Scopes, " "))
	q.Set("state", state)
	q.Set("code_challenge", challenge)
	q.Set("code_challenge_method", "S256")

	http.Redirect(w, r, h.cfg.IdPAuthURL+"?"+q.Encode(), http.StatusFound)
}

func (h *AuthHandler) Callback(w http.ResponseWriter, r *http.Request) {
	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	if state == "" || code == "" {
		http.Error(w, "missing state or code", http.StatusBadRequest)
		return
	}
	data, ok := h.cfg.StateStore.Take(state)
	if !ok {
		http.Error(w, "invalid or expired state", http.StatusBadRequest)
		return
	}

	email, err := h.exchangeCode(r.Context(), code, data.Verifier)
	if err != nil {
		http.Error(w, "token exchange failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	h.cfg.Signer.SetCookie(w, email, h.cfg.SessionTTL, h.cfg.Dev)
	redirect := data.Redirect
	if redirect == "" || !strings.HasPrefix(redirect, "/") {
		redirect = "/"
	}
	http.Redirect(w, r, redirect, http.StatusFound)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, _ *http.Request) {
	h.cfg.Signer.Clear(w, h.cfg.Dev)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) exchangeCode(ctx context.Context, code, verifier string) (string, error) {
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", h.cfg.RedirectURL)
	form.Set("client_id", h.cfg.ClientID)
	form.Set("code_verifier", verifier)
	if h.cfg.ClientSecret != "" {
		form.Set("client_secret", h.cfg.ClientSecret)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.cfg.IdPTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := h.cfg.HTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("idp returned %d: %s", resp.StatusCode, string(body))
	}

	var tok struct {
		IDToken string `json:"id_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", err
	}
	return extractEmailClaim(tok.IDToken)
}

// extractEmailClaim parses the id_token without verifying its signature because
// we just received it from the IdP's token endpoint over TLS with mutual auth
// (client_id + client_secret). If the deployment exposes the token endpoint
// over a less-trusted channel, switch to full OIDC verification in a follow-up.
func extractEmailClaim(idToken string) (string, error) {
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return "", errors.New("malformed id_token")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", err
	}
	var claims struct {
		Email string `json:"email"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return "", err
	}
	if claims.Email == "" {
		return "", errors.New("id_token missing email claim")
	}
	return claims.Email, nil
}

func randomBase64URL(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func codeChallengeS256(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
