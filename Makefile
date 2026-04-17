.PHONY: install lint test generate build tidy clean distclean help

help:
	@echo "make install   # install node_modules and Go tools"
	@echo "make generate  # regenerate types from spec"
	@echo "make lint      # spectral + go vet + tsc"
	@echo "make test      # go test + vitest"
	@echo "make build     # build all artifacts"
	@echo "make tidy      # go mod tidy + pnpm dedupe"
	@echo "make clean     # remove generated artifacts"
	@echo "make distclean # clean + remove node_modules and dist"

install:
	pnpm install
	go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.3.0

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

distclean: clean
	rm -rf */dist */node_modules
