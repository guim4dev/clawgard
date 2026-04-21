.PHONY: install lint test generate build tidy clean distclean help \
        dashboard-install dashboard-test dashboard-build dashboard-e2e

help:
	@echo "make install          # install node_modules and Go tools"
	@echo "make generate         # regenerate types from spec"
	@echo "make lint             # spectral + go vet + tsc"
	@echo "make test             # go test + vitest + dashboard typecheck"
	@echo "make build            # build all artifacts (incl. dashboard dist)"
	@echo "make tidy             # go mod tidy + pnpm dedupe"
	@echo "make clean            # remove generated artifacts"
	@echo "make distclean        # clean + remove node_modules and dist"
	@echo "make dashboard-test   # dashboard Vitest + vue-tsc typecheck"
	@echo "make dashboard-build  # regenerate spec, build dashboard dist"
	@echo "make dashboard-e2e    # dashboard Playwright (requires local Postgres on 5433)"

install:
	pnpm install
	go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.3.0

generate:
	cd spec-go && PATH="$$(go env GOPATH)/bin:$$PATH" go generate ./...
	pnpm --filter @clawgard/spec generate

lint: generate
	pnpm dlx @stoplight/spectral-cli@latest lint --ruleset spec/.spectral.yaml spec/clawgard.openapi.yaml
	cd spec-go && go vet ./...
	pnpm --filter @clawgard/spec typecheck

test: generate dashboard-test
	cd spec-go && go test ./...
	cd server && go test ./...
	pnpm -r test

build: dashboard-build
	cd server && go build -o dist/clawgard-server ./cmd/clawgard-server

tidy:
	cd spec-go && go mod tidy
	pnpm -r install

clean:
	rm -f spec-go/generated.go spec-ts/src/generated.ts
	rm -rf server/web/dist

distclean: clean
	rm -rf */dist */node_modules

# Dashboard (Plan 5) targets.
dashboard-install:
	pnpm install

dashboard-test: dashboard-install
	pnpm --filter @clawgard/dashboard test
	pnpm --filter @clawgard/dashboard typecheck

dashboard-build: dashboard-install generate
	pnpm --filter @clawgard/dashboard build

dashboard-e2e: dashboard-build
	cd server && go build -o /tmp/clawgard-server-e2e ./cmd/clawgard-server
	pnpm --filter @clawgard/dashboard test:e2e
