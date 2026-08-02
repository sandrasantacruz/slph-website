# slph-website

Website für Sandra Santacruz. **Reines Astro-Frontend**, komplett statisch
gebaut: kein Adapter, kein SSR, kein Laufzeit-Backend. Die Artikel und
Veranstaltungen kommen zur Build-Zeit aus dem Multi-Tenant-CMS pulpo (siehe
„Content-Collection aus pulpo"), alles andere steht im Repo.

> Der Abschnitt zum Omnibus-Container (PocketBase, Caddy, s6-overlay) unten
> beschreibt den **alten** Betrieb. Das `backend/`-Verzeichnis und die
> `pb:*`-Skripte sind noch da, für die neue Auslieferung aber nicht mehr nötig.

## Stack

| Komponente   | Wofür                                            | Port (intern) |
| ------------ | ------------------------------------------------ | ------------- |
| Astro 6      | Web-Frontend, **statisch** gebaut nach `dist/`   | –             |
| pulpo        | CMS für Artikel und Veranstaltungen, nur zur Build-Zeit gelesen | – |
| PocketBase   | Altbestand: DB und Admin-UI aus `backend/`, für die Auslieferung nicht mehr nötig | `8090` |
| Caddy        | Reverse-Proxy: `/api/*` + `/_/*` → PocketBase, Rest → Astro | `8080`        |
| s6-overlay   | Supervisor für die drei Prozesse im Omnibus-Container | –             |

## Projekt-Layout

```
.
├── astro.config.mjs        # output: 'static', kein Adapter
├── src/
│   ├── pages/              # Astro-Routen
│   ├── content.config.ts   # Collection `posts` (Loader: lib/pulpo-loader.ts)
│   └── lib/                # posts, search, seo, settings
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
pnpm dev:web      # Astro allein (:4321) — reicht für die Seite
pnpm dev          # zusätzlich das alte PocketBase (:8090)
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
| `pnpm migrate:pulpo` | Artikel ins neue System migrieren (siehe unten)       |

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

### Cloudflare Pages

`.github/workflows/deploy.yml` baut auf Push nach `main` und deployed `dist/`
per `wrangler pages deploy` in das Pages-Projekt **`silospeceshablaran`**.
Pull Requests landen als Preview-Deployment unter dem Branch-Namen.

Voraussetzungen (einmalig):

1. Pages-Projekt `silospeceshablaran` im Cloudflare-Dashboard anlegen
   (Typ „Direct Upload“, kein Git-Connect, sonst deployt Cloudflare parallel selbst).
2. Repository-Secrets setzen:
   - `CLOUDFLARE_API_TOKEN` (Permission „Cloudflare Pages: Edit“)
   - `CLOUDFLARE_ACCOUNT_ID`

Der Workflow erwartet den Build-Output in `dist/`. Das passt: ohne Adapter
schreibt Astro direkt dorthin, `dist/client` und `dist/server` gibt es nicht
mehr.

## Migration in das neue System (pulpo)

`scripts/migrate-to-pulpo.mjs` übernimmt die Artikel dieser Seite in das
Multi-Tenant-System (`SCHEMA.md` §13/§14):

| Hier                       | Dort                                                  |
| -------------------------- | ----------------------------------------------------- |
| `posts.content` (BlockNote)| `posts.body` + `publishedBody` (`{es: "<p>…"}` HTML)  |
| `posts.cover`              | `media`-Record (WebP ≤1500 px) + `posts.coverImage`   |
| `posts.typ`                | `posts.kind` (`article`/`event`) + Tag `noticia`/`evento` |
| `posts.event_date`/`_end`  | `posts.startsAt` / `endsAt`                           |
| `posts.location`           | `posts.location` (lokalisiert)                        |
| `posts.address_url`        | `posts.mapEmbed` (nur echte `/maps/embed`-URLs)       |
| `posts.slug`               | `posts.postKey` + `routes.slug` = `noticias/<slug>`   |
| `posts.excerpt`            | `posts.teaser`                                        |
| `posts.published_at`       | `posts.publishedAt` (Fallback `event_date`)           |

`visibleFrom` bleibt leer, migriert werden ausschließlich bereits
veröffentlichte Beiträge. **Rubriken (`post_categories`) vergibt das Skript
nicht**: es legt keine an und schreibt `category` leer. Artikel und
Veranstaltung trennt `kind`. Achtung bei `--force`: der Lauf setzt `category`
auch an bestehenden Artikeln zurück, eine im Admin von Hand gesetzte Rubrik
geht dabei verloren.

Das Skript ist **idempotent**: ein zweiter Lauf überspringt vorhandene Artikel
(Erkennung über `postKey`, Bilder über `media.label`). `--force` aktualisiert
sie stattdessen.

```bash
# Ziel-Zugang in .env eintragen (PULPO_URL, PULPO_EMAIL, PULPO_PASSWORD)
pnpm migrate:pulpo --dry-run          # zeigt nur, was passieren würde
pnpm migrate:pulpo                    # schreibt
pnpm migrate:pulpo --only=news --limit=5
pnpm migrate:pulpo --force            # bestehende Artikel überschreiben
pnpm migrate:pulpo --prefix=blog      # anderes URL-Schema statt noticias/
```

Voraussetzungen im Ziel, die das Skript **nicht** anlegt:

- das Restaurant selbst und ein `users`-Login mit `website`-Berechtigung
  (daraus leitet das Skript den Tenant ab; alternativ `PULPO_SUPERUSER=1` plus
  `PULPO_RESTAURANT`)
- eine `pages`-Zeile mit Route-Slug `noticias` als Übersichtsseite
  (`postList`-Block). Ohne sie sind die Artikel nur einzeln erreichbar.

Drei Eigenheiten des Ziels, an die sich das Skript hält:

- **Veranstaltungen:** `startsAt` ist für `kind=event` Pflicht (Go-Hook
  `validateEvent`), deshalb bricht das Skript bei einem Event ohne Datum mit
  Meldung ab, statt eine kaputte Zeile anzulegen. Und Events **verfallen**: die
  „Demnächst"-Liste filtert `startsAt >= @now`. Alle 69 Bestands-Events liegen
  in der Vergangenheit, landen also im Rückblick, nicht in der Vorschau. Über
  ihre URL bleiben sie erreichbar.

- **Bilder:** `media.file` muss WebP mit höchstens 1500 px Kantenlänge sein
  (Go-Riegel `MaxImageEdge`), sonst lehnt das Backend den Upload ab. Bereits
  passende Dateien werden unverändert durchgereicht, alles andere konvertiert
  sharp. Die aktuellen Cover erfüllen die Grenze bereits.
- **HTML:** der Artikelkörper läuft serverseitig durch bluemonday. Erlaubt sind
  `p`, `h2`–`h4`, Listen, `a[href]`, `blockquote`, `pre/code`, `figure`,
  Tabellen. Keine `class`-Attribute, kein `iframe`, und `<img>` **nur** mit
  `data-media-id`. Das Skript erzeugt deshalb eigenes Markup und nutzt
  `src/lib/blocknote-render.ts` (Tailwind-Klassen, YouTube-Embeds) bewusst nicht.

### Content-Collection aus pulpo

`src/content.config.ts` definiert **eine** Collection `posts` mit Artikeln und
Veranstaltungen zusammen, gefüllt vom Loader `src/lib/pulpo-loader.ts`. Der
läuft zur Build-Zeit und liest anonym: die List-Regel im Ziel gibt nur
veröffentlichte und bereits sichtbare Beiträge heraus. Nach dem Build braucht
die Seite kein PocketBase mehr, was die Voraussetzung für Cloudflare Pages ist.

```astro
---
import { getCollection, render } from 'astro:content';

const all = await getCollection('posts');
const articulos = all.filter((p) => p.data.kind === 'article');
const eventos = all.filter((p) => p.data.kind === 'event');

const ahora = new Date();
const proximos = eventos
  .filter((p) => (p.data.endsAt ?? p.data.startsAt)! >= ahora)
  .sort((a, b) => +a.data.startsAt! - +b.data.startsAt!);

const { Content } = await render(all[0]);
---
```

Was der Loader liefert:

- `id` ist der `postKey` des Ziels, also stabil über Umbenennungen der URL.
- `path` ist die **verbindliche** URL aus `routes` (z.B. `/noticias/tal-cual`),
  `slug` nur deren letztes Segment für eine Seite wie `/noticias/[slug]`.
  Im Ziel darf ein Slug beliebig aussehen und wird im Back Office geändert,
  deshalb setzt der Loader kein Präfix voraus. Hat ein Beitrag mehrere Routen,
  gewinnt die zuletzt angelegte, und der Build sagt welche.
- Der Körper steht als fertiges HTML unter `rendered`, nicht in den Daten:
  gesäubert hat ihn schon das Ziel, hier wird nichts mehr gerendert.
- `<img data-media-id="…">` im HTML löst der Loader in echte Datei-URLs auf
  (ohne `?thumb=`, siehe `CLAUDE.md`). Zeigt ein Bild ins Leere, fliegt es mit
  einer Warnung raus, statt einen kaputten `<img>` auszuliefern.
- Daten kommen entlokalisiert an: `title` ist ein String, nicht `{es: "…"}`.
  Welche Sprache, sagt `PULPO_LANG` (Default `es`); fehlt sie an einem Beitrag,
  nimmt der Loader die erste belegte.

Aus dieser Collection lesen und damit **prerendered** sind: `/noticias`,
`/noticias/<slug>`, `/sitemap.xml` und `/buscar`. Der URL-Parameter der
Artikelseite ist die Entry-ID (`postKey`), nicht `data.path`: so bleiben die
bestehenden Artikel-URLs stabil, auch wenn im Back Office ein Route-Slug
umbenannt wird.

Zwei Verhaltensänderungen, die daraus folgen:

- **`/sitemap.xml` entsteht beim Build.** Ein neuer Beitrag steht mit dem
  nächsten Deploy drin, nicht in dem Moment, in dem er im Back Office
  erscheint.
- **`/buscar` filtert im Browser.** Statisch gibt es kein `?q=` zur Build-Zeit,
  also liefert die Seite alle durchsuchbaren Einträge einmal aus (13 Seiten und
  alle Artikel als fertige Karten, versteckt) und blendet passende ein. Das
  spart eine zweite Kartenimplementierung in JavaScript, macht die Suche
  sofort reaktiv und kostet rund 44 kB gzip, etwa so viel wie `/noticias`.
  Gesucht wird akzentunabhängig (`src/lib/search.ts`), „oceanos" findet also
  auch „Océanos". Die URL wird per `history.replaceState` mitgeführt, ein
  Treffer bleibt teilbar.

Es gibt keine serverseitigen Routen mehr. `/admin`, die Middleware und die
PocketBase-Helfer sind entfernt; die Kontaktdaten für `/contacto`,
`/aviso-legal` und `/politica-de-privacidad` stehen als `SETTINGS` in
`src/lib/settings.ts` statt in einer Collection.

Konfiguriert wird das in **`src/config.ts`** (CMS-URL, Tenant-ID, Sprache und
optional eine abweichende Bild-Basis-URL). Die Werte liegen bewusst im Repo
statt in Repository-Variablen: es sind keine Geheimnisse, sie ändern sich
nicht pro Umgebung, und ein Build mit vergessener Variable würde still eine
leere Seite deployen. Der CI-Workflow braucht dadurch keinen `env`-Block.

Für lokale Arbeit gegen eine andere Instanz überschreiben gleichnamige
Variablen aus `.env` die Werte:

```bash
PULPO_URL=http://localhost:8081
PULPO_RESTAURANT=<lokale Tenant-ID>
```

## .env

`.env.example` als Template kopieren:

```bash
cp .env.example .env
```

`PUBLIC_POCKETBASE_URL` wird vom Node SSR für interne PB-API-Calls genutzt (defaults auf `http://127.0.0.1:8090`). `PB_APP_URL` setzt zusätzlich PocketBases Application-URL **und** ist die Browser-facing URL für File-Links (`<img src>`, Admin-Uploads) — wird zur Laufzeit gelesen, also pro Environment in der Compose-`environment` setzen. Die übrigen `PB_*`-Variablen liest das Go-Backend.

```bash
magick -density 200 "book.pdf[0,9-25,146]" \
  -profile "/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc" \
  -profile "/System/Library/ColorSync/Profiles/sRGB Profile.icc" \
  -colorspace sRGB \
  -resize '1500x1500>' -strip -quality 85 \
  +adjoin -scene 1 '%d.webp'
for f in [0-9].webp; do mv "$f" "0$f"; done
```