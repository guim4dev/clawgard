package auth

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWriteRead_RoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "buddy.key")
	require.NoError(t, Write(path, "sk-abc123"))

	got, err := Read(path)
	require.NoError(t, err)
	require.Equal(t, "sk-abc123", got)
}

func TestWrite_UnixFileMode0600(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("mode check is unix-only")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "buddy.key")
	require.NoError(t, Write(path, "sk-xyz"))

	info, err := os.Stat(path)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0600), info.Mode().Perm())
}

func TestRead_MissingIsClearError(t *testing.T) {
	_, err := Read(filepath.Join(t.TempDir(), "absent"))
	require.Error(t, err)
	require.True(t, errors.Is(err, os.ErrNotExist), "error %q should wrap os.ErrNotExist", err)
}
