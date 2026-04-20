package auth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"

	"golang.org/x/crypto/bcrypt"
)

// APIKeyPrefix marks clawgard-issued keys so operators (and the dashboard
// reveal UI) can recognise them at a glance. Never stored — the bcrypt hash
// of the full prefixed key is what lives in the DB.
const APIKeyPrefix = "ck_"

// APIKeyLength is the length of a full API key: the "ck_" prefix plus 32
// random bytes base64url-encoded (43 chars, no padding).
const APIKeyLength = len(APIKeyPrefix) + 43

// GenerateAPIKey returns a cryptographically random opaque API key prefixed
// with "ck_" so it is visibly a clawgard credential.
func GenerateAPIKey() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return APIKeyPrefix + base64.RawURLEncoding.EncodeToString(buf), nil
}

// HashAPIKey bcrypt-hashes an API key for storage. Cost is 12.
func HashAPIKey(key string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(key), 12)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// VerifyAPIKey returns nil if the key matches the stored hash, else an error.
func VerifyAPIKey(hash, key string) error {
	if hash == "" || key == "" {
		return errors.New("empty hash or key")
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(key))
}
