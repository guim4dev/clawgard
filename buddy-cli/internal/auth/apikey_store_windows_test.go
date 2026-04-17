//go:build windows

package auth

import (
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWrite_WindowsACL_NoGroupOrEveryone(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "buddy.key")
	require.NoError(t, Write(path, "sk-win"))

	out, err := exec.Command("icacls", path).CombinedOutput()
	require.NoError(t, err, string(out))
	s := string(out)
	require.NotContains(t, s, "Everyone")
	require.NotContains(t, s, "BUILTIN\\Users")
}
