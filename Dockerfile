# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine
ARG GO_VERSION=1.25-alpine
ARG S6_OVERLAY_VERSION=3.2.1.0

# ---------- Stage 1: build PocketBase Go binary ----------
FROM --platform=$BUILDPLATFORM golang:${GO_VERSION} AS go-builder
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
	go build -trimpath -ldflags="-s -w" -o /out/pocketbase .

# ---------- Stage 2: build Astro SSR bundle ----------
FROM node:${NODE_VERSION} AS web-builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile
COPY astro.config.mjs tsconfig.json ./
COPY src ./src
COPY public ./public
RUN pnpm build
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile --prod

# ---------- Stage 3: final runtime ----------
FROM node:${NODE_VERSION}
ARG TARGETARCH
ARG S6_OVERLAY_VERSION

RUN apk add --no-cache caddy ca-certificates tzdata xz

# s6-overlay v3
RUN set -eux; \
	case "${TARGETARCH}" in \
		amd64) S6_ARCH=x86_64 ;; \
		arm64) S6_ARCH=aarch64 ;; \
		*) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
	esac; \
	wget -qO /tmp/s6-noarch.tar.xz "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz"; \
	wget -qO /tmp/s6-arch.tar.xz "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz"; \
	tar -C / -Jxpf /tmp/s6-noarch.tar.xz; \
	tar -C / -Jxpf /tmp/s6-arch.tar.xz; \
	rm /tmp/s6-*.tar.xz

# Application binaries + assets
COPY --from=go-builder  /out/pocketbase     /usr/local/bin/pocketbase
COPY --from=web-builder /app/dist           /app/dist
COPY --from=web-builder /app/node_modules   /app/node_modules
COPY --from=web-builder /app/package.json   /app/package.json

# s6 services + caddy config
COPY docker/rootfs/ /
COPY docker/Caddyfile /etc/caddy/Caddyfile
RUN chmod +x \
	/etc/s6-overlay/s6-rc.d/pocketbase/run \
	/etc/s6-overlay/s6-rc.d/astro/run \
	/etc/s6-overlay/s6-rc.d/caddy/run \
	&& mkdir -p /data/pb_data

VOLUME ["/data"]
EXPOSE 8080

ENV NODE_ENV=production \
	HOST=127.0.0.1 \
	PORT=3000 \
	S6_KEEP_ENV=1 \
	S6_BEHAVIOUR_IF_STAGE2_FAILS=2

ENTRYPOINT ["/init"]
