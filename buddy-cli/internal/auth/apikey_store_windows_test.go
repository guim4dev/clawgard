//go:build windows

package auth

import (
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWrite_WindowsACL_NoBroadAccess(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "buddy.key")
	require.NoError(t, Write(path, "sk-win"))

	out, err := exec.Command("icacls", path).CombinedOutput()
	require.NoError(t, err, string(out))
	// icacls output begins with the file path; strip it so the test name /
	// temp-dir path can't accidentally match the ACL needles below.
	acls := strings.TrimPrefix(string(out), path)
	require.NotContains(t, acls, "Everyone")
	require.NotContains(t, acls, "BUILTIN\\Users")
}
