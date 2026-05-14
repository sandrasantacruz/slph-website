# CLAUDE.md

Kurzbriefing für AI-Agenten in diesem Repo. Allgemeines (Stack, Deployment, Docker)
steht in `README.md` — hier nur die Konventionen, die man aus dem Code nicht direkt
ableiten kann.

## Sprachen

- **User-facing Strings**: Spanisch (Seite ist für ein spanisches Publikum).
- **Code-Kommentare / Commit-Messages**: Deutsch oder Englisch, beides OK.
- **`<html lang="es">`** ist fix in beiden Layouts.

## Rendering-Modell

`astro.config.mjs` ist auf **`output: 'static'`**. Das heißt:

- **Default ist Prerender** — neue Seiten unter `src/pages/` werden zur Build-Zeit
  als statisches HTML in `dist/client/` ausgegeben.
- **Opt-out** für serverseitig gerenderte Seiten via `export const prerender = false;`
  ganz oben im Frontmatter (oder in `.ts`-Endpoints).
- Aktuell SSR: alles unter `/admin/*` (Auth-geschützt, dynamische PB-Queries).
- Aktuell prerendered: alle 15 öffentlichen Seiten.

**Wenn du eine Seite mit Live-PB-Daten baust** (z.B. dynamisches `/noticias`-Listing),
**nicht vergessen** `export const prerender = false`, sonst wird die Liste beim Build
eingefroren.

## Image-Strategie

**Wir verwenden Astros `<Image>` aus `astro:assets` bewusst NICHT.** Sharp ist keine
Dependency, der `/_image`-Endpoint wird nie aufgerufen. Grund: in SSR-Modus hält das
Image-Service-Cache jede Variante im RAM (~1,5–17 MB pro Variante), was bei mehr als
einer Handvoll Bilder den Speicher gnadenlos auffrisst.

Stattdessen:

- **Statische Marketing-Bilder** (Logo, Hero etc.) → optimiert in `public/assets/`
  ablegen, plain `<img src="/assets/...">`.
- **PocketBase-Uploads** (Post-Cover, Galería-Fotos) → PocketBase liefert eigene
  Thumbnails per `?thumb=400x300` an der File-URL. Direkt einbinden:
  ```astro
  <img src={`${PB_URL}/api/files/${record.collectionId}/${record.id}/${record.cover}?thumb=400x300`} />
  ```

## Datenmodell (PocketBase)

Eine einzige Inhalts-Collection **`posts`** für sowohl Veranstaltungen als auch
Pressemeldungen. Der Diskriminator ist das Feld `typ`.

| Feld           | Typ                          | Pflicht | Hinweis                                                       |
| -------------- | ---------------------------- | ------- | ------------------------------------------------------------- |
| `id`           | text (15 chars autogen)      | ja      | Primary key, system.                                          |
| `typ`          | select single                | **ja**  | Werte: `event`, `news`. Steuert UI und Pflichtfeld-Logik.     |
| `title`        | text                         | nein    |                                                               |
| `slug`         | text (`^[a-z0-9-]+$`)        | nein    | **Unique über die ganze Collection** — events und news teilen den slug-Namespace. |
| `excerpt`      | text                         | nein    |                                                               |
| `content`      | json                         | nein    | BlockNote-Blöcke (siehe `lib/blocknote-render`).              |
| `cover`        | file (single)                | nein    |                                                               |
| `images`       | file (max 10)                | nein    | Inline-Bilder im BlockNote-Editor.                            |
| `status`       | select                       | nein    | `draft` / `published` / `archived`.                           |
| `published_at` | date                         | nein    | Listen-Sortierung. Public-Sichtbarkeit: nur wenn `<= @now`.   |
| `event_date`   | text (ISO-Datum als String)  | nein    | **Nur bei `typ='event'` befüllt.**                             |
| `event_end`    | text                         | nein    | dito, optional.                                               |
| `location`     | text                         | nein    | dito.                                                         |
| `address_url`  | text                         | nein    | dito.                                                         |
| `created`      | autodate                     | —       |                                                               |
| `updated`      | autodate                     | —       |                                                               |

Indexes: `UNIQUE(slug)`, `(status, published_at)`.

Rules:
- `listRule` / `viewRule`: `@request.auth.id != "" || (status = "published" && published_at <= @now)`
- `createRule` / `updateRule` / `deleteRule`: `@request.auth.id != ""`

Konventionen:
- **Event-Felder** (`event_date`/`event_end`/`location`/`address_url`) im
  Editor und in der Validierung **nur konditional** anzeigen/prüfen, wenn
  `typ='event'`. Bei `typ='news'` bleiben sie leer.
- **Datumsfelder** für Events sind im Schema `text`, werden aber als
  ISO-Strings (`Date.toISOString()`) gespeichert. Beim Lesen `new Date(value)`.
- Public-Listings filtern immer mit
  `status = "published" && published_at <= @now`.

## Layouts

| Layout            | Wann                       | Brand-Elemente               |
| ----------------- | -------------------------- | ---------------------------- |
| `MainLayout`      | Alle öffentlichen Seiten   | Navbar + Footer mit Logo     |
| `AdminLayout`     | Alle `/admin/*`-Seiten     | Schlichter Admin-Header      |

`Navbar`/`Footer` werden **niemals** auf Admin-Seiten gerendert.

## Page-Komposition & Views

Jede Seite hat einen eigenen Ordner unter `src/views/<route>/`. Darin liegt
`Page.astro` (importiert das Layout und komponiert die Section-Komponenten)
sowie die page-spezifischen Sections (Hero, FeatureGrid, etc.) als eigene
`.astro`-Dateien daneben — auch wenn eine Section nur einmal verwendet wird.

Die Datei unter `src/pages/<route>.astro` dient ausschließlich dem
Astro-Routing und ist ein dünner Wrapper, der die View rendert:

```astro
---
import Page from '../views/programa/Page.astro';
---
<Page />
```

`src/components/` ist **nur** für seitenübergreifend wiederverwendete
Komponenten reserviert (Navbar, Footer, Bubbles, generische UI-Bausteine).
Page-spezifische Sections gehören dort **nicht** hin.

Resultierende Struktur:

```
src/
  components/         # geteilte Bausteine
  views/
    <route>/
      Page.astro      # Layout + Section-Komposition
      <Section>.astro # page-spezifische Sections
  pages/
    <route>.astro     # 3-Zeiler, rendert <Page />
```

## Viewport-Höhen

Für Full-Viewport-Abschnitte (Hero etc.) `svh` statt `vh` verwenden — sonst
springt das Layout in mobilen Browsern, wenn die Adressleiste ein-/ausgeblendet
wird. Die Navbar ist 6rem hoch, d.h. ein "voller" Hero unter der Navbar ist
`min-h-[calc(100svh-6rem)]`.

## Theme & Design-Tokens

`src/styles/global.css` definiert ein Tailwind-v4-`@theme`-Block mit der Palette
und Typografie der ursprünglichen Sandra-Site (`nueva.silospeceshablaran.com`):

```
--color-azul    #0b2056   (primärer Navy-Hintergrund)
--color-celeste #64aad2
--color-caparol #f8f8fc   (off-white Text auf azul)
--color-arena   #fadeaa   (CTA / Highlight)
--color-gris    #606060
--color-negro   #000000

--font-sans      Varela Round   (Body)
--font-display   Londrina Solid (Headings, CTAs)
```

Verwendung über Tailwind-Utilities: `bg-azul`, `text-caparol`, `font-display` etc.
Fonts kommen via `@fontsource/*`-Packages (selbst-gehostet, kein Google-CDN-Call).

## Icons

[`astro-icon`](https://github.com/natemoo-re/astro-icon) mit
`@iconify-json/simple-icons` für Brand-Glyphen. Beispiel:
```astro
import { Icon } from 'astro-icon/components';
<Icon name="simple-icons:instagram" class="h-5 w-5" />
```
Bei Bedarf weitere Iconify-Sets dazu installieren (z.B. `@iconify-json/lucide` für
UI-Icons). Astro inlined beim Build nur die tatsächlich benutzten Icons.

## Middleware

`src/middleware.ts` macht drei Dinge zur Laufzeit:

1. **Build-Time-Short-Circuit** via `context.isPrerendered` — kein Request-Zugriff,
   kein PB-Setup beim Prerender.
2. **Analytics-Reverse-Proxy** für `/analytics/*` → `analytics.pulpo.cloud`.
   Cookies und Host werden gestripped, X-Forwarded-For wird gesetzt. Der Provider
   ist im Browser-Devtools nicht erkennbar.
3. **PocketBase-Session** aus dem Cookie ableiten, in `context.locals.pb` und
   `context.locals.user` ablegen, und `/admin/*` ohne User auf `/admin/login`
   umleiten.

## Analytics

Script-Tag in `MainLayout.astro`, nur in **Production** (`import.meta.env.PROD`):
```html
<script defer src="/analytics/script.js"
  data-website-id="..."
  data-host-url="/analytics"></script>
```
`data-host-url="/analytics"` ist wichtig — sonst würde der Tracker direkt an
`analytics.pulpo.cloud` posten und unsere Tarnung wäre nutzlos.

## Auth (Admin)

- PocketBase-Cookie-Session, gesetzt von `/admin/login` (POST-Handler).
- `src/lib/pb.ts` exportiert `pbFromCookie`, `authCookie`, `clearAuthCookie`.
- Middleware liest den Cookie, baut die PB-Instanz, und gated `/admin/*`.
- Logout via `/admin/logout` POST.

## Env Vars

Siehe `.env.example`. Wichtigste:

| Var                                  | Wofür                                                          |
| ------------------------------------ | -------------------------------------------------------------- |
| `PUBLIC_POCKETBASE_URL`              | PB-Basis-URL für Client und Server                             |
| `PB_SUPERUSER_EMAIL` / `_PASSWORD`   | Auto-Bootstrap eines Superusers beim ersten Serve-Start        |
| `PB_USER_EMAIL` / `_PASSWORD`        | Auto-Bootstrap eines regulären Users in der `users`-Collection |
| `PB_APP_URL` / `PB_APP_NAME`         | Überschreiben der Admin-Settings beim Boot                     |

`PB_*_UPDATE=1` erzwingt jeweils, dass das Passwort bei Existenz überschrieben wird.

## Kommandos

```sh
pnpm dev          # Astro + PocketBase parallel (concurrently)
pnpm dev:web      # nur Astro
pnpm pb:serve     # nur PocketBase
pnpm pb:migrate   # PB-Migrationen ausführen
pnpm build        # Astro-Build (static + server für /admin)
```

## Anti-Patterns

- ❌ Kein `import { Image } from 'astro:assets'`. Wenn du verleitet bist, lies
  oben den Abschnitt „Image-Strategie".
- ❌ Kein `sharp` als Dependency hinzufügen.
- ❌ Keine User-State-abhängige Logik in `MainLayout`/`Navbar`/`Footer`, sonst
  bricht die Prerender-Annahme der Public-Pages.
- ❌ Keine Server-only-Logik (PB-Queries, `Astro.locals.user`-Reads) in einer
  prerendered Seite — fügt entweder `prerender = false` hinzu, oder verschiebt
  die Logik in einen Client-Fetch.
