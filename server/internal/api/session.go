package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

const SessionCookieName = "clawgard_session"

var (
	ErrInvalidSession = errors.New("invalid session token")
	ErrSessionExpired = errors.New("session expired")
)

type sessionPayload struct {
	Email     string `json:"email"`
	ExpiresAt int64  `json:"exp"`
}

type SessionSigner struct {
	secret []byte
}

func NewSessionSigner(secret []byte) *SessionSigner {
	if len(secret) < 32 {
		panic("session secret must be at least 32 bytes")
	}
	return &SessionSigner{secret: secret}
}

func (s *SessionSigner) Sign(email string, ttl time.Duration) (string, error) {
	payload := sessionPayload{Email: email, ExpiresAt: time.Now().Add(ttl).Unix()}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	enc := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(enc))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return enc + "." + sig, nil
}

func (s *SessionSigner) Verify(token string) (string, error) {
	dot := -1
	for i := len(token) - 1; i >= 0; i-- {
		if token[i] == '.' {
			dot = i
			break
		}
	}
	if dot <= 0 {
		return "", ErrInvalidSession
	}
	enc, sig := token[:dot], token[dot+1:]
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(enc))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return "", ErrInvalidSession
	}
	raw, err := base64.RawURLEncoding.DecodeString(enc)
	if err != nil {
		return "", ErrInvalidSession
	}
	var p sessionPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return "", ErrInvalidSession
	}
	if time.Now().Unix() > p.ExpiresAt {
		return "", ErrSessionExpired
	}
	return p.Email, nil
}

func (s *SessionSigner) SetCookie(w http.ResponseWriter, email string, ttl time.Duration, dev bool) {
	token, err := s.Sign(email, ttl)
	if err != nil {
		http.Error(w, "session sign failed", http.StatusInternalServerError)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   !dev,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(ttl),
	})
}

func (s *SessionSigner) Clear(w http.ResponseWriter, dev bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   !dev,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

func (s *SessionSigner) Read(r *http.Request) (string, error) {
	c, err := r.Cookie(SessionCookieName)
	if err != nil {
		return "", ErrInvalidSession
	}
	return s.Verify(c.Value)
}
