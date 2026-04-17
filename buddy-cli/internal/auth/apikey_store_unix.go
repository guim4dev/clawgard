//go:build !windows

package auth

// restrictACL is a no-op on Unix; 0600 from WriteFile is sufficient.
func restrictACL(path string) error { return nil }
