# CLAUDE.md

Kurzbriefing für AI-Agenten in diesem Repo. Allgemeines (Stack, Deployment, Docker)
steht in `README.md` — hier nur die Konventionen, die man aus dem Code nicht direkt
ableiten kann.

## Sprachen

- **User-facing Strings**: Spanisch (Seite ist für ein spanisches Publikum).
- **Code-Kommentare / Commit-Messages**: Deutsch oder Englisch, beides OK.
- **`<html lang="es">`** ist fix in beiden Layouts.

## Rendering-Modell

`astro.config.mjs` steht auf **`output: 'static'` ohne Adapter**. Es gibt keine
serverseitigen Routen mehr:

- Jede Seite unter `src/pages/` wird zur Build-Zeit gerendert und landet als
  statisches HTML direkt in `dist/`.
- `export const prerender = false` ist **kein gültiges Mittel mehr** — ohne
  Adapter scheitert der Build daran.
- Dynamische Inhalte kommen über die Content-Collection `posts`
  (`src/content.config.ts`, Loader `src/lib/pulpo-loader.ts`), die beim Build
  einmal aus dem CMS liest. Ein neuer Beitrag erscheint mit dem nächsten
  Deploy, nicht sofort.
- Was zur Laufzeit passieren muss, passiert im Browser. Beispiel: `/buscar`
  liefert alle durchsuchbaren Einträge aus und filtert clientseitig.

## Image-Strategie

Die Seite ist vollständig statisch. Bilder aus dem CMS laufen deshalb beim
Build durch Astros `<Image />` aus `astro:assets`: sie werden heruntergeladen,
skaliert, als WebP nach `dist/_astro/` geschrieben und im Markup lokal
verlinkt. Die ausgelieferte Seite braucht das CMS zur Laufzeit nicht.

> Frühere Fassung dieser Datei verbot `astro:assets` samt `sharp`. Der Grund
> war der SSR-Betrieb: der Image-Service hielt dort jede Variante im RAM
> (~1,5–17 MB pro Variante). Ohne Adapter und ohne SSR gibt es diesen Cache
> nicht mehr, die Verarbeitung passiert einmal beim Build. `sharp` ist deshalb
> jetzt eine reguläre Dependency.

- **Entfernte Quellen freigeben:** `astro.config.mjs` listet unter
  `image.remotePatterns` die erlaubten Hosts. Ohne Eintrag lehnt Astro das
  Bild ab, statt es zu laden.
- **Maße mitgeben:** `<Image>` braucht bei entfernten Quellen `width` und
  `height`. Die stehen im `media`-Record und liefert der Loader in
  `data.cover` mit. Kein `inferSize`, das lädt jedes Bild ein zweites Mal.
- **Nicht hochskalieren:** Astro vergrößert nicht. Eine geforderte Breite über
  der Quelle liefert die Quellbreite zurück; wer daneben `og:image:width`
  setzt, schreibt sonst eine Lüge ins Markup. Für Vorschaubilder deshalb die
  Maße aus `data.cover` nehmen (siehe `views/novedades/Detail.astro`).
- **Vorschaubilder** über `getImage()` erzeugen und mit `absoluteUrl()`
  ausgeben, damit auch `og:image` auf die eigene Domain zeigt.
- **Statische Marketing-Bilder** (Logo, Hero etc.) → weiterhin optimiert in
  `public/assets/` ablegen, plain `<img src="/assets/...">`.
- **Galería-Bilder** (`/galeria`) → liegen als WebP statisch unter
  `public/assets/galeria/<sección>/`. Konvention: max. 1500×1500 px, Q85
  (`magick … -resize '1500x1500>' -strip -quality 85 out.webp`). Werden in
  `src/views/galeria/Page.astro` zur Build-Zeit via `fs.readdirSync`
  eingelesen — neue Bilder einfach in den jeweiligen Section-Ordner kopieren,
  kein Code-Edit nötig. Sektion-IDs: `musical`, `cuento`, `eventos`,
  `momentos`, `contaminacion`.
- **Inline-Bilder im Artikelkörper** stehen als `<img data-media-id="…">` im
  gespeicherten HTML und werden im Loader zu CMS-URLs aufgelöst, nicht von
  `<Image>` angefasst. Aktuell gibt es keine.

**Cover-Format-Konvention:** Post-Cover werden als **3:2 quer, 1500×1000 px,
WebP Q85** hochgeladen. Listing (`NovedadCard`) und Detail-Hero rendern beide
`aspect-[3/2]` + `object-cover`, das Bild wird also mittig auf 3:2 beschnitten.
Da das Upload gleichzeitig als `og:image` dient und Social-Plattformen
zusätzlich eigene Zuschnitte fahren (Facebook 1.91:1, Twitter 2:1, WhatsApp
fast quadratisch), gilt: **Wesentliches in die mittleren ~80% der Höhe**, nicht
an Ober- oder Unterkante.

```sh
magick input.jpg -resize '1500x1000^' -gravity center -extent 1500x1000 \
  -strip -quality 85 out.webp
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

### Settings (Singleton)

Zweite Collection **`settings`** hält site-weite Kontaktdaten als Einzelrecord.
Wird im Frontend von `src/lib/settings.ts:getSettings` gelesen und im Backend
über `/admin/ajustes` editiert.

| Feld       | Typ      | Pflicht | Hinweis                                                           |
| ---------- | -------- | ------- | ----------------------------------------------------------------- |
| `id`       | text     | ja      | Fester Wert `defaultsettings` (per Seed-Migration angelegt).      |
| `whatsapp` | text     | nein    | Telefonnummer mit/ohne `+`-Prefix.                                |
| `phone`    | text     | nein    | Festnetz/Mobile, frei formatiert.                                 |
| `email`    | text     | nein    | E-Mail.                                                           |
| `created`  | autodate | —       |                                                                   |
| `updated`  | autodate | —       |                                                                   |

Rules:
- `listRule` / `viewRule`: leer (= public read; die öffentliche `/contacto`-Seite
  liest ohne Auth).
- `createRule` / `deleteRule`: `null` — **bewusst gesperrt.** Nur die
  Seed-Migration (`backend/migrations/*_seed_settings_singleton.go`) legt den
  Record an; nichts kann ihn über die API löschen.
- `updateRule`: `@request.auth.id != ""` (Admin-Form aktualisiert nur).

Konventionen:
- **Strict-Singleton:** Es existiert genau ein Record mit ID `defaultsettings`.
  Migrationen sind der einzige Ort, an dem Records entstehen oder gelöscht
  werden. Das Frontend macht daher nur `update`, keine `create`-Fallback.
- **Leerer String** pro Feld blendet im Frontend den jeweiligen CTA aus.

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

`src/middleware.ts` macht zwei Dinge zur Laufzeit:

1. **Build-Time-Short-Circuit** via `context.isPrerendered` — kein Request-Zugriff,
   kein PB-Setup beim Prerender.
2. **PocketBase-Session** aus dem Cookie ableiten, in `context.locals.pb` und
   `context.locals.user` ablegen, und `/admin/*` ohne User auf `/admin/login`
   umleiten.

## Analytics

Script-Tag in `MainLayout.astro`, nur in **Production** (`import.meta.env.PROD`):
```html
<script defer src="https://analytics.pulpo.cloud/script.js"
  data-website-id="..."></script>
```

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

- ❌ Kein `<Image>` ohne `width`/`height` bei entfernten Quellen.
- ❌ Keine geforderte Zielbreite über der Quellbreite (Astro skaliert nicht hoch).
- ❌ Kein `export const prerender = false`. Es gibt keinen Adapter mehr, die
  Seite ist vollständig statisch — eine serverseitige Route lässt den Build
  scheitern.
- ❌ Keine Laufzeit-Abfragen gegen das CMS. Inhalte kommen über die
  Content-Collection zur Build-Zeit.
