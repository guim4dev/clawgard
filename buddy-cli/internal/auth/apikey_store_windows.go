//go:build windows

package auth

// restrictACL is a best-effort hardening pass on Windows.
// Full DACL manipulation is added in Task 16.
func restrictACL(path string) error { return nil }
