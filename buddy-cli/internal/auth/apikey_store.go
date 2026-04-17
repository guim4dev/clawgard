package auth

import (
	"os"
	"path/filepath"
	"strings"
)

func Write(path, key string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	if err := os.WriteFile(path, []byte(strings.TrimSpace(key)+"\n"), 0600); err != nil {
		return err
	}
	return restrictACL(path)
}

func Read(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(b)), nil
}
