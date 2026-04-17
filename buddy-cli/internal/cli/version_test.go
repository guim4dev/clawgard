package cli

import (
	"bytes"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestVersionCommand_PrintsInjectedVersion(t *testing.T) {
	root := NewRootCmd(BuildInfo{Version: "1.2.3", Commit: "abc1234", Date: "2026-04-16"})
	var buf bytes.Buffer
	root.SetOut(&buf)
	root.SetArgs([]string{"version"})
	require.NoError(t, root.Execute())

	out := buf.String()
	require.True(t, strings.Contains(out, "1.2.3"), "expected version in output, got %q", out)
	require.True(t, strings.Contains(out, "abc1234"), "expected commit in output, got %q", out)
}
