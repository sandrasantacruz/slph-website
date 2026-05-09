# slph-website

Website + Backend für Sandra Santacruz. Astro-Frontend (SSR via Node-Adapter) und ein eigenes PocketBase-Backend, gebaut als ein Go-Binary. Im Produktiv-Image liegen beide Prozesse plus Caddy als Reverse-Proxy unter s6-overlay in einem einzigen Container.

## Stack

| Komponente   | Wofür                                            | Port (intern) |
| ------------ | ------------------------------------------------ | ------------- |
| Astro 6 SSR  | Web-Frontend, gerendert via `@astrojs/node`      | `3000`        |
| PocketBase   | DB, Auth, Admin-UI, REST-API – als eigenes Go-Binary aus `backend/` | `8090`        |
| Caddy        | Reverse-Proxy: `/api/*` + `/_/*` → PocketBase, Rest → Astro | `8080`        |
| s6-overlay   | Supervisor für die drei Prozesse im Omnibus-Container | –             |

## Projekt-Layout

```
.
├── astro.config.mjs        # output: server, adapter @astrojs/node standalone
├── src/
│   ├── pages/              # Astro-Routen
│   └── lib/pocketbase.ts   # JS-SDK Wrapper
├── backend/                # Go-Modul: slph.de/backend
│   ├── main.go             # PocketBase-Entrypoint, Hooks, migratecmd
│   ├── bootstrap.go        # Env-basierter Superuser- & Settings-Bootstrap
│   ├── migrations/         # Go-Migrations (auto-generiert via Admin-UI)
│   └── pb_data/            # Laufzeitdaten (gitignored)
├── docker/
│   ├── Caddyfile           # Routing-Regeln
│   └── rootfs/             # In Container gemerged: /etc/s6-overlay/...
├── Dockerfile              # 3-stage: go-builder → web-builder → node:22-alpine
├── docker-compose.yml      # Lokales Test-Setup
└── .github/workflows/
    └── docker.yml          # Build + Push nach GHCR auf push/main
```

## Voraussetzungen

- Node ≥ 22.12 + pnpm
- Go ≥ 1.25 (PocketBase v0.38 verlangt das)
- Docker (nur für Image-Build / Compose)

## Lokale Entwicklung

```bash
pnpm install
pnpm dev          # startet Astro (:4321) + PocketBase (:8090) parallel
```

Erste Schritte zum Anlegen eines Superusers, ohne env zu setzen:

```bash
cd backend && go run . superuser upsert dev@example.com mypassword
```

Mit env (siehe unten) macht der Bootstrap das automatisch beim ersten Start.

Nützliche URLs im Dev-Modus:

- `http://127.0.0.1:4321`        – Astro Dev-Server
- `http://127.0.0.1:8090/_/`     – PocketBase Admin-UI
- `http://127.0.0.1:8090/api/`   – PocketBase REST-API

## pnpm Scripts

| Script             | Wirkung                                                |
| ------------------ | ------------------------------------------------------ |
| `pnpm dev`         | Astro + PocketBase parallel (`concurrently`)           |
| `pnpm dev:web`     | Nur Astro                                              |
| `pnpm pb:serve`    | Nur PocketBase (`go run . serve`)                      |
| `pnpm pb:migrate`  | Migrations ausführen (`go run . migrate`)              |
| `pnpm pb:build`    | Standalone-Binary bauen → `bin/pocketbase`             |
| `pnpm build`       | Astro Production-Build (`dist/`)                       |
| `pnpm preview`     | Astro Production-Preview                               |

## Backend (PocketBase als Go-Binary)

Statt das offizielle PocketBase-Binary zu nutzen, kompilieren wir ein eigenes mit eingebetteten Migrations und Hooks. Das erlaubt:

- **Go-Migrations** in `backend/migrations/`. Bei `go run` ist `Automigrate` aktiv – Schema-Änderungen im Admin-UI werden automatisch als `.go`-Files unter `backend/migrations/` abgelegt und mitkompiliert.
- **OnServe-Hooks** in `backend/main.go`, die beim Start vor der Listener-Initialisierung laufen.
- **Eigener Installer**: `installerFuncWithAppURL` in `backend/bootstrap.go` ersetzt die Standard-Install-URL, sodass sie `PB_APP_URL` als Base nutzt statt der internen Listen-Adresse.

### Env-basierter Bootstrap

`backend/bootstrap.go` liest beim `serve`-Start folgende Variablen. Alles ist optional und idempotent.

| Variable                | Wirkung                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `PB_SUPERUSER_EMAIL`    | Email des zu bootstrappenden Superusers                            |
| `PB_SUPERUSER_PASSWORD` | Passwort dazu (beide oder keines – sonst fail-fast beim Start)     |
| `PB_SUPERUSER_UPDATE`   | `1`/`true` → Passwort eines bestehenden Users überschreiben        |
| `PB_APP_URL`            | Settings > Application URL (z.B. für Email-Templates `{APP_URL}`)  |
| `PB_APP_NAME`           | Settings > Application Name                                        |

Verhalten: Leere Werte → Admin-UI-Wert bleibt unverändert. Gesetzte Werte → falls abweichend, in DB persistiert; bei jedem Neustart erneut abgeglichen.

## Docker

### Lokal testen mit Compose

```bash
docker compose up -d --build       # erstes Mal / nach Code-Änderung
docker compose logs -f             # alle drei Services im Stream
docker compose down                # stop, Daten bleiben
docker compose down -v             # stop + DB löschen
```

Mit Bootstrap-Env (entweder ad-hoc oder über `.env` neben dem Compose-File):

```bash
PB_SUPERUSER_EMAIL=root@example.com \
PB_SUPERUSER_PASSWORD=geheim \
PB_APP_URL=https://slph.example.com \
docker compose up -d --build
```

Container hört intern auf `:8080`. Per Default mappt Compose auf Host-`8080` – per `HOST_PORT=8081 docker compose up` änderbar.

### Image-Aufbau

`Dockerfile` ist 3-stage:

1. `golang:1.25-alpine` baut `backend/` zu `/out/pocketbase`
2. `node:22-alpine` baut Astro SSR-Bundle, prunt `node_modules` auf `--prod`
3. `node:22-alpine` Final: kopiert PB-Binary, Astro-Bundle, installiert Caddy + s6-overlay v3, mountet `docker/rootfs/` nach `/`

s6-Services unter `docker/rootfs/etc/s6-overlay/s6-rc.d/`:

- `pocketbase/` – `pocketbase serve --dir=/data/pb_data --http=127.0.0.1:8090`
- `astro/` – `node /app/dist/server/entry.mjs` (HOST=127.0.0.1, PORT=3000)
- `caddy/` – `caddy run --config /etc/caddy/Caddyfile`

Persistente Daten in `/data` (Volume-Mount empfohlen).

## CI/CD

`.github/workflows/docker.yml` baut auf Push nach `main` und auf Tags `v*` ein `linux/amd64`-Image und pushed nach `ghcr.io/sandrasantacruz/slph-website`. Pull Requests bauen ohne Push.

Tag-Schema (über `docker/metadata-action`):

| Trigger              | Tags                                              |
| -------------------- | ------------------------------------------------- |
| Push auf `main`      | `latest`, `main`, `sha-<short>`                   |
| Tag `v1.2.3`         | `1.2.3`, `1.2`, `latest`, `sha-<short>`           |
| Pull Request         | `pr-<n>` (nur Build, kein Push)                   |

Image pullen:

```bash
docker pull ghcr.io/sandrasantacruz/slph-website:latest
```

## .env

`.env.example` als Template kopieren:

```bash
cp .env.example .env
```

`PUBLIC_POCKETBASE_URL` wird vom JS-SDK Wrapper gelesen (`src/lib/pocketbase.ts`), die `PB_*`-Variablen vom Go-Backend.
