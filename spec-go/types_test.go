package spec_test

import (
	"testing"

	spec "github.com/clawgard/clawgard/spec-go"
)

func TestBuddyTypeExists(t *testing.T) {
	var b spec.Buddy
	if b.Name != "" {
		t.Fatalf("zero value should have empty Name")
	}
}
