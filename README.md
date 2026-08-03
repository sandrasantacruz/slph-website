# slph-website

Website für Sandra Santacruz. **Reines Astro-Frontend**, komplett statisch
gebaut: kein Adapter, kein SSR, kein Laufzeit-Backend. Die Artikel und
Veranstaltungen kommen zur Build-Zeit aus dem Multi-Tenant-CMS pulpo (siehe
„Content-Collection aus pulpo"), alles andere steht im Repo.

## Stack

| Komponente | Wofür                                                          |
| ---------- | -------------------------------------------------------------- |
| Astro 6    | Web-Frontend, **statisch** gebaut nach `dist/`                  |
| pulpo      | CMS für Artikel und Veranstaltungen, nur zur Build-Zeit gelesen |
| Cloudflare Pages | Auslieferung der statischen Dateien                       |

## Projekt-Layout

```
.
├── astro.config.mjs        # output: 'static', kein Adapter
├── src/
│   ├── config.ts           # CMS-URL, Tenant, Sprache
│   ├── content.config.ts   # Collection `posts` (Loader: lib/pulpo-loader.ts)
│   ├── pages/              # Astro-Routen (dünne Wrapper)
│   ├── views/<route>/      # Page.astro + seitenspezifische Sections
│   ├── components/         # seitenübergreifende Bausteine
│   └── lib/                # pulpo-loader, posts, search, seo, settings
├── public/                 # statische Assets, 1:1 nach dist/
├── scripts/
│   └── migrate-to-pulpo.mjs
└── .github/workflows/
    └── deploy.yml          # Build + Deploy nach Cloudflare Pages
```

## Voraussetzungen

- Node ≥ 22.12 + pnpm

## Lokale Entwicklung

```bash
pnpm install
pnpm dev          # Astro auf :4321
```

Die Inhalte zieht der Build aus dem CMS (`src/config.ts`), lokal läuft also
nichts weiter nebenher. Gegen eine eigene pulpo-Instanz entwickeln: `PULPO_URL`
und `PULPO_RESTAURANT` in `.env` setzen.

## pnpm Scripts

| Script             | Wirkung                                                |
| ------------------ | ------------------------------------------------------ |
| `pnpm dev`         | Astro Dev-Server (:4321)                               |
| `pnpm build`       | Astro Production-Build (`dist/`)                       |
| `pnpm preview`     | Astro Production-Preview                               |
| `pnpm migrate:pulpo` | Artikel ins neue System migrieren (siehe unten)       |

## CI/CD

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
| `posts.slug`               | `posts.postKey` + `routes.slug` (ohne Präfix)         |
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
pnpm migrate:pulpo --prefix=blog      # Routen im CMS unter blog/ anlegen
```

Voraussetzungen im Ziel, die das Skript **nicht** anlegt:

- das Restaurant selbst und ein `users`-Login mit `website`-Berechtigung
  (daraus leitet das Skript den Tenant ab; alternativ `PULPO_SUPERUSER=1` plus
  `PULPO_RESTAURANT`)
- eine `pages`-Zeile mit `postList`-Block, falls die Übersicht auch **im CMS**
  gerendert werden soll. Für diese Seite ist sie nicht nötig, `/noticias` baut
  die Liste selbst aus der Collection.

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
- `path` ist die URL aus `routes` (z.B. `/tal-cual`), `slug` deren letztes
  Segment. Die Adressen **dieser** Seite bildet aber `postPath()` aus der
  Entry-ID, siehe unten.
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

Für einen normalen Build braucht es keine `.env`: CMS-URL, Tenant und Sprache
stehen in `src/config.ts`. Die Variablen dienen dem Entwickeln gegen eine
andere Instanz und dem Migrationsskript.

```bash
magick -density 200 "book.pdf[0,9-25,146]" \
  -profile "/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc" \
  -profile "/System/Library/ColorSync/Profiles/sRGB Profile.icc" \
  -colorspace sRGB \
  -resize '1500x1500>' -strip -quality 85 \
  +adjoin -scene 1 '%d.webp'
for f in [0-9].webp; do mv "$f" "0$f"; done
```