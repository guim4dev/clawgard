.PHONY: lint test generate build tidy clean help

help:
	@echo "make generate  # regenerate types from spec"
	@echo "make lint      # spectral + golangci + eslint"
	@echo "make test      # go test + vitest"
	@echo "make build     # build all artifacts"
	@echo "make tidy      # go mod tidy + pnpm dedupe"
	@echo "make clean     # remove build artifacts"

generate:
	cd spec-go && PATH="$$(go env GOPATH)/bin:$$PATH" go generate ./...
	pnpm --filter @clawgard/spec generate

lint:
	pnpm dlx @stoplight/spectral-cli@latest lint --ruleset spec/.spectral.yaml spec/clawgard.openapi.yaml
	cd spec-go && go vet ./...
	pnpm --filter @clawgard/spec typecheck

test: generate
	cd spec-go && go test ./...
	pnpm -r test

build: generate
	@echo "nothing to build yet (bootstrap phase)"

tidy:
	cd spec-go && go mod tidy
	pnpm -r install

clean:
	rm -f spec-go/generated.go spec-ts/src/generated.ts
	rm -rf */dist */node_modules
