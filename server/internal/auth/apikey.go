package auth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"

	"golang.org/x/crypto/bcrypt"
)

// APIKeyLength is the length of base64url-encoded API keys.
const APIKeyLength = 43 // 32 random bytes base64url-encoded (no padding)

// GenerateAPIKey returns a cryptographically random opaque API key.
func GenerateAPIKey() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
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
