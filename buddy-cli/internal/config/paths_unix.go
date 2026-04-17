//go:build !windows

package config

import "os"

func userConfigDir() (string, error) { return os.UserConfigDir() }
