//go:build generate

package spec

//go:generate oapi-codegen -config oapi-config.yaml ../spec/clawgard.openapi.yaml
