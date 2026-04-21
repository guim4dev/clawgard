# syntax=docker/dockerfile:1.7
# Release image for clawgard-server. The binary is pre-built by GoReleaser and
# copied in; entrypoint runs database migrations before `serve`.
FROM alpine:3.19

RUN apk add --no-cache ca-certificates wget \
    && addgroup -g 1000 clawgard \
    && adduser -u 1000 -G clawgard -D clawgard

COPY clawgard-server /usr/local/bin/clawgard-server
COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/clawgard-server

USER clawgard
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["serve"]
