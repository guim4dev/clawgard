# syntax=docker/dockerfile:1.7
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.work go.work
COPY spec-go/ spec-go/
COPY server/ server/
WORKDIR /src/server
ARG VERSION=dev
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    GOWORK=off CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" \
    -o /out/clawgard-server ./cmd/clawgard-server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/clawgard-server /clawgard-server
USER nonroot
EXPOSE 8080
ENTRYPOINT ["/clawgard-server", "serve"]
