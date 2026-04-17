//go:build windows

package auth

import (
	"fmt"

	"golang.org/x/sys/windows"
)

// restrictACL sets a DACL that grants FullControl only to the current user,
// stripping inherited ACEs (including BUILTIN\Users and Everyone).
func restrictACL(path string) error {
	sid, err := currentUserSID()
	if err != nil {
		return fmt.Errorf("get current user SID: %w", err)
	}
	acl, err := windows.ACLFromEntries([]windows.EXPLICIT_ACCESS{{
		AccessPermissions: windows.GENERIC_ALL,
		AccessMode:        windows.GRANT_ACCESS,
		Inheritance:       windows.NO_INHERITANCE,
		Trustee: windows.TRUSTEE{
			TrusteeForm:  windows.TRUSTEE_IS_SID,
			TrusteeType:  windows.TRUSTEE_IS_USER,
			TrusteeValue: windows.TrusteeValueFromSID(sid),
		},
	}}, nil)
	if err != nil {
		return err
	}
	return windows.SetNamedSecurityInfo(
		path,
		windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION,
		nil, nil, acl, nil,
	)
}

func currentUserSID() (*windows.SID, error) {
	t, err := windows.OpenCurrentProcessToken()
	if err != nil {
		return nil, err
	}
	defer t.Close()
	u, err := t.GetTokenUser()
	if err != nil {
		return nil, err
	}
	return u.User.Sid, nil
}
