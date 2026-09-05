# Web production bundle. Browser dependencies first for layer caching,
# then sources, then the production build that Go embeds.
FROM node:24-slim AS web
RUN corepack enable
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# Static Go binary.
FROM golang:1.27 AS go
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . ./
COPY --from=web /app/web/dist ./web/dist
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=${VERSION}" -o /zer ./cmd/zer

# Minimal runtime with CA certificates for outbound HTTPS.
FROM alpine:3
RUN apk add --no-cache ca-certificates \
    && adduser -D -u 10000 zer \
    && mkdir -p /data && chown zer:zer /data
COPY --from=go /zer /usr/local/bin/zer
USER zer
ENV PORT=8080 \
    DATA_DIR=/data \
    GOMEMLIMIT=180MiB
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget -qO- http://127.0.0.1:8080/healthz > /dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/zer"]
