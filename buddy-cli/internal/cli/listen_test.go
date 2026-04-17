package cli

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestListenCmd_RequiresOnQuestionFlag(t *testing.T) {
	root := NewRootCmd(BuildInfo{Version: "t"})
	root.SetArgs([]string{"listen"})
	var buf bytes.Buffer
	root.SetErr(&buf)
	root.SetOut(&buf)
	err := root.Execute()
	require.Error(t, err)
	require.Contains(t, err.Error(), "on-question")
}

func TestListenCmd_AcceptsQuestionTimeoutFlag(t *testing.T) {
	root := NewRootCmd(BuildInfo{Version: "t"})
	root.SetArgs([]string{"listen", "--on-question", "/bin/true", "--question-timeout", "30s", "--dry-run"})
	var buf bytes.Buffer
	root.SetErr(&buf)
	root.SetOut(&buf)
	require.NoError(t, root.Execute())
}
