# CLAUDE.md

Kurzbriefing für AI-Agenten in diesem Repo. Allgemeines (Stack, Deployment)
steht in `README.md` — hier nur die Konventionen, die man aus dem Code nicht
direkt ableiten kann.

## Sprachen

- **User-facing Strings**: Spanisch (Seite ist für ein spanisches Publikum).
- **Code-Kommentare / Commit-Messages**: Deutsch oder Englisch, beides OK.
- **`<html lang="es">`** ist fix in `MainLayout`.

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
  `public/assets/galeria/<sección>/`. Konvention: max. 1500×1500 px, Q92:

  ```sh
  magick input.png -auto-orient \
    -profile "/System/Library/ColorSync/Profiles/sRGB Profile.icc" \
    -filter Lanczos -resize '1500x1500>' -strip \
    -define webp:method=6 -define webp:use-sharp-yuv=1 -quality 92 out.webp
  ```

  Das `-profile` **vor** dem `-strip` ist kein Detail: die Kamera-JPEGs tragen
  ein Adobe-RGB-Profil, und wer es nur wegwirft, liefert flaue Farben aus
  (Browser lesen profillose Bilder als sRGB). Q92 liegt am Knick der Kurve,
  darüber kostet jedes Prozent spürbar Bytes ohne sichtbaren Gewinn.

  Die unkomprimierten Originale liegen gitignored unter `_originals/galeria/`
  — gleiche Ordner- und Dateinamen wie das erzeugte WebP, nur mit
  Original-Endung. Bewusst außerhalb von `public/`, sonst wandern sie in den
  Build. Ein Umkodieren (andere Kantenlänge, andere Qualität) braucht damit
  kein erneutes Kopieren.

  Dateiname
  `NN-sprechender-slug.webp` — die führende Nummer bestimmt die Reihenfolge
  (alphabetische Sortierung), der Slug ist ASCII-kleingeschrieben. Werden in
  `src/views/galeria/Page.astro` zur Build-Zeit via `fs.readdirSync`
  eingelesen — neue Bilder einfach in den jeweiligen Section-Ordner kopieren,
  kein Code-Edit nötig. Die Bildunterschrift kommt aus der `captions`-Map der
  Section (Key = Dateiname ohne `.webp`); ohne Eintrag wird sie aus dem
  Dateinamen abgeleitet, dann aber ohne Akzente. Sektion-IDs: `musical`,
  `transformacion`, `librupeces`, `cuento`, `espectaculos`, `eventos`,
  `talleres`, `centros-escolares`, `conferencias`, `momentos`,
  `contaminacion`.
- **Inline-Bilder im Artikelkörper** stehen als `<img data-media-id="…">` im
  gespeicherten HTML und werden im Loader zu CMS-URLs aufgelöst, nicht von
  `<Image>` angefasst. Aktuell gibt es keine.

**Cover-Format-Konvention:** Post-Cover als **3:2 quer, 1500×1000 px, WebP
Q85** hochladen. Die Karten in der Übersicht schneiden beim Build auf 3:2
(`coverBox()` in `lib/posts.ts`, Anker aus dem Fokuspunkt), der Detail-Kopf
zeigt das Bild **ungeschnitten** in seinem eigenen Format. Das Vorschaubild
für Social ist wieder 3:2, und da die Plattformen zusätzlich eigene Zuschnitte
fahren (Facebook 1.91:1, Twitter 2:1, WhatsApp fast quadratisch), gilt:
**Wesentliches in die mittleren ~80 % der Höhe**, nicht an Ober- oder
Unterkante.

```sh
magick input.jpg -resize '1500x1000^' -gravity center -extent 1500x1000 \
  -strip -quality 85 out.webp
```

## Datenmodell

Inhalte liegen im Multi-Tenant-CMS **pulpo** und werden ausschließlich zur
Build-Zeit gelesen. Das Repo hat keine eigene Datenbank mehr.

Eine Collection **`posts`** trägt Artikel und Veranstaltungen zusammen, `kind`
(`article` / `event`) unterscheidet sie. Der Loader `src/lib/pulpo-loader.ts`
verflacht die CMS-Sicht in die Astro-Collection:

| Astro (`data.…`)     | pulpo                             | Hinweis                                                    |
| -------------------- | --------------------------------- | ---------------------------------------------------------- |
| `id` (Entry-Key)     | `posts.postKey`                   | stabil, Unique-Index; bildet die URL dieser Seite           |
| `title` / `teaser`   | lokalisierte JSON-Maps            | Sprache aus `src/config.ts`                                 |
| `rendered.html`      | `publishedBody` (Fallback `body`) | fertiges, im CMS gesäubertes HTML                           |
| `kind`               | `kind`                            | leer im CMS zählt als `article`                             |
| `startsAt`/`endsAt`  | dito                              | nur bei Veranstaltungen; Pflichtfeld `startsAt`             |
| `location`/`mapEmbed`| dito                              | `mapEmbed` ist immer eine geprüfte Maps-Embed-URL           |
| `cover`              | `coverImage` → `media`            | `src`, `width`, `height`, `alt`, `focalX`/`focalY`          |
| `path` / `slug`      | `routes.slug`                     | die URL **dieser** Seite baut `postPath()`, nicht `path`    |

Fallen, die im CMS begründet sind:

- **`(focalX, focalY) === (0, 0)` heißt „nicht gesetzt"**, nicht „links oben".
  PocketBase liefert für ein ungesetztes optionales Zahlenfeld `0`.
- **Ein Beitrag kann mehrere Routen haben.** Es gibt kein „kanonisch"-Flag; der
  Loader nimmt die zuletzt angelegte und protokolliert die Wahl.
- **Nur veröffentlichte Beiträge sind anonym lesbar.** Entwürfe und geplante
  Beiträge liefert die API gar nicht erst aus.

## Layouts

`MainLayout` ist das einzige Layout: Navbar und Footer mit Logo, dazu die
SEO-Tags aus `components/Seo.astro`.

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

## Analytics

Script-Tag in `MainLayout.astro`, nur in **Production** (`import.meta.env.PROD`):
```html
<script defer src="https://analytics.pulpo.cloud/script.js"
  data-website-id="..."></script>
```

## Env Vars

Für einen normalen Build braucht es keine: CMS-URL, Tenant und Sprache stehen
in `src/config.ts`. `.env` überschreibt sie nur für lokale Arbeit gegen eine
andere Instanz (`PULPO_URL`, `PULPO_RESTAURANT`, `PULPO_LANG`,
`PULPO_PUBLIC_URL`). Die übrigen Einträge in `.env.example` gehören zum
Migrationsskript.

## Kommandos

```sh
pnpm dev            # Astro Dev-Server (:4321)
pnpm build          # statischer Build nach dist/
pnpm preview        # Build lokal ausliefern
pnpm migrate:pulpo  # einmaliges Migrationsskript (Quelle existiert nicht mehr)
```

## Anti-Patterns

- ❌ Kein `<Image>` ohne `width`/`height` bei entfernten Quellen.
- ❌ Keine geforderte Zielbreite über der Quellbreite (Astro skaliert nicht hoch).
- ❌ Kein `export const prerender = false`. Es gibt keinen Adapter mehr, die
  Seite ist vollständig statisch — eine serverseitige Route lässt den Build
  scheitern.
- ❌ Keine Laufzeit-Abfragen gegen das CMS. Inhalte kommen über die
  Content-Collection zur Build-Zeit.
