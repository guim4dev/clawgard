//go:build windows

package config

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDefaultConfigPath_UsesAppData(t *testing.T) {
	t.Setenv("APPDATA", `C:\Users\Test\AppData\Roaming`)
	p, err := DefaultConfigPath()
	require.NoError(t, err)
	require.True(t, strings.Contains(p, `AppData\Roaming\clawgard\config.json`), "got %s", p)
}
