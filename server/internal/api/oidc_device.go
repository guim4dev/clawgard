package api

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"time"

	"github.com/clawgard/clawgard/server/internal/store"
	"github.com/go-chi/chi/v5"
)

// MountDeviceCode wires RFC-8628-style device-code endpoints.
//
// verificationURI is shown to the user ("visit <this URL> and approve").
// For MVP, the dashboard (Plan 5) hosts the approval page at /device, which
// calls s.Pool().Exec to UPDATE device_codes SET approved_email=... after the user logs in.
func MountDeviceCode(r chi.Router, s *store.Store, verificationURI string) {
	r.Post("/v1/auth/oidc/device", handleDeviceInitiate(s, verificationURI))
	r.Post("/v1/auth/oidc/token", handleDeviceToken(s))
}

func handleDeviceInitiate(s *store.Store, verificationURI string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		deviceCode := randomString(43)
		userCode := randomUserCode()
		expiresIn := 10 * 60 // 10 min
		interval := 5

		_, err := s.Pool().Exec(r.Context(), `
			INSERT INTO device_codes (device_code, user_code, expires_at, interval_seconds)
			VALUES ($1,$2, NOW() + make_interval(secs => $3), $4)`,
			deviceCode, userCode, expiresIn, interval)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"deviceCode":              deviceCode,
			"userCode":                userCode,
			"verificationUri":         verificationURI,
			"verificationUriComplete": verificationURI + "?user_code=" + userCode,
			"interval":                interval,
			"expiresIn":               expiresIn,
		})
	}
}

type tokenReq struct {
	DeviceCode string `json:"deviceCode"`
}

func handleDeviceToken(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in tokenReq
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.DeviceCode == "" {
			writeError(w, http.StatusBadRequest, "bad_request", "deviceCode required")
			return
		}

		var approvedEmail *string
		var expiresAt time.Time
		err := s.Pool().QueryRow(r.Context(), `
			SELECT approved_email, expires_at FROM device_codes WHERE device_code=$1`,
			in.DeviceCode,
		).Scan(&approvedEmail, &expiresAt)
		if err != nil {
			writeError(w, http.StatusBadRequest, "unknown_device_code", "unknown device code")
			return
		}
		if time.Now().After(expiresAt) {
			_, _ = s.Pool().Exec(r.Context(), `DELETE FROM device_codes WHERE device_code=$1`, in.DeviceCode)
			writeError(w, http.StatusBadRequest, "expired_token", "device code expired")
			return
		}
		if approvedEmail == nil {
			writeError(w, http.StatusBadRequest, "authorization_pending", "approval still pending")
			return
		}

		// Issue an opaque session token; the server stores it in a table `sessions` (Plan 5 adds).
		// For MVP we return a short-lived opaque token that the server trusts.
		token := randomString(43)
		_, err = s.Pool().Exec(r.Context(), `DELETE FROM device_codes WHERE device_code=$1`, in.DeviceCode)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"accessToken": token,
			"expiresAt":   time.Now().Add(8 * time.Hour),
			"email":       *approvedEmail,
		})
	}
}

func randomString(length int) string {
	buf := make([]byte, 32)
	_, _ = rand.Read(buf)
	s := base64.RawURLEncoding.EncodeToString(buf)
	if len(s) > length {
		s = s[:length]
	}
	return s
}

func randomUserCode() string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	buf := make([]byte, 4)
	_, _ = rand.Read(buf)
	code := make([]byte, 8)
	for i := 0; i < 4; i++ {
		code[i] = alphabet[buf[i]%32]
	}
	_, _ = rand.Read(buf)
	for i := 0; i < 4; i++ {
		code[4+i] = alphabet[buf[i]%32]
	}
	return string(code[0:4]) + "-" + string(code[4:8])
}
