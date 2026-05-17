# SEO-Pflege & Google Search Console

Kurzanleitung, wie der Sitelinks-Bereich und die Indexierung gepflegt werden.
Alles, was sich nicht direkt im Code lösen lässt (das wäre meiste der
Sitelinks-Themen), passiert in der **Google Search Console** (kostenlos,
search.google.com/search-console).

## Einmalig einrichten

1. **Search Console öffnen** → Property anlegen → Typ **„Domain"** wählen
   (nicht „URL-Präfix", damit `http`, `https`, `www`, `non-www` alle in
   einer Property landen).
2. Domain `silospeceshablaran.com` eintragen.
3. Verifizierung: Google zeigt einen **DNS TXT-Record** an. Den im
   DNS-Provider als TXT-Record unter `@` (Root) eintragen, bis
   die Verifizierung greift (in der Regel ein paar Minuten).
4. Sobald verifiziert: Linke Spalte → **Sitemaps** → URL
   `sitemap.xml` eintragen und absenden. Status sollte nach kurzer Zeit
   auf **„Erfolgreich"** wechseln.

## Sitelinks beobachten (die Sub-Links unter dem Suchtreffer)

- Sitelinks **kannst du nicht direkt setzen** — Google wählt sie
  algorithmisch aus Seitenstruktur, Klickverhalten und Backlinks. Seit 2016
  ist auch das ehemalige „Demote sitelinks"-Tool entfernt.
- Was du im Code bereits hast, um sie zu beeinflussen:
  - `SiteNavigationElement`-JSON-LD im `MainLayout` (Hauptnav-Labels).
  - Saubere, eindeutige `<title>`-Tags pro Route.
  - `sitemap.xml` mit `priority`-Werten (Home = 1.0, Hauptseiten = 0.7–0.9).
- Wenn alte/falsche Sitelinks erscheinen (z.B. das veraltete „Noticias"
  statt „Novedades"): in der Search Console **URL-Inspektion** öffnen,
  die alte URL eingeben, dann „Indexierung beantragen" anklicken. Das
  forciert einen Recrawl, der dann das neue Schema ausliest. Bei
  vollständig gelöschten URLs (wie /noticias) zusätzlich unter
  **Entfernen → Vorübergehende Entfernungen** eine Sperre setzen, bis
  Google es selbst aus dem Index nimmt.

## Sitelinks-Search-Box

Damit Google in den Suchergebnissen direkt unter dem Treffer ein eigenes
Suchfeld einblendet, ist das `SearchAction`-Schema notwendig **und** die
darin angegebene URL muss eine echte Suchseite zurückliefern. Beides ist
gegeben:

- JSON-LD: in `src/lib/seo.ts:websiteSchema()`
  (`potentialAction.SearchAction` → `https://silospeceshablaran.com/buscar?q={search_term_string}`).
- Suchseite: `src/pages/buscar.astro` (SSR, durchsucht statische Pages und
  PocketBase-Posts).

Google entscheidet trotzdem von Fall zu Fall, ob die Box angezeigt wird —
meist erst, wenn die Marke ausreichend Suchvolumen hat.

## Google Business Profile (die Box rechts neben dem Treffer)

Die Karte mit „Artist in Las Palmas de Gran Canaria" stammt **nicht** aus
der Website, sondern aus einem **Google Business Profile** (früher Google
My Business). Pflegen geht so:

1. business.google.com öffnen.
2. „Anspruchsformular" für das bestehende Profil ausfüllen oder ein neues
   anlegen (Kategorie z.B. „Künstler" oder „Verlag/Projekt").
3. Nach der Verifizierung (Postkarte, Telefon oder E-Mail) lassen sich
   Telefon, Adresse, Öffnungszeiten, Fotos, Beschreibung und die offizielle
   Website-URL (`silospeceshablaran.com`) selbst editieren.

Das Profil ist **getrennt vom Suchergebnis**: erst wenn beide
„kongruent" sind (gleiche Marke, gleiche Webseite), zieht Google die
beiden zusammen und zeigt das Profil neben dem Webtreffer an.

## Rich-Result-Test laufen lassen

Jedes Mal, wenn JSON-LD-Schemas im Code angepasst werden:
[https://search.google.com/test/rich-results](https://search.google.com/test/rich-results)
mit der Live-URL füttern. Fehler werden direkt angezeigt; Warnungen sind
meist optionale Felder und können ignoriert werden.

Zusätzlich für Schemas, die nicht „Rich Result"-fähig sind:
[https://validator.schema.org](https://validator.schema.org).

## Pflege im Alltag

- Wenn eine neue Hauptseite dazukommt → in
  `src/pages/sitemap.xml.ts` (`STATIC_URLS`) und in
  `src/views/buscar/Page.astro` (`STATIC_PAGES`) ergänzen.
- Wenn die FAQ wachsen sollen → `src/views/home/faq-data.ts`. Die FAQ-Items
  landen automatisch im JSON-LD (siehe `faqSchema()`) und in der Sektion
  auf der Home.
- Wenn sich Kontaktdaten ändern → die `settings`-Collection in PB
  bearbeiten (`/admin/ajustes`); die ContactPage-JSON-LD-Knoten auf
  `/contacto` ziehen sich daraus.
- `llms.txt` (`public/llms.txt`) gelegentlich kontrollieren, vor allem
  wenn neue Buchhandlungen, Termine oder Social-Profile dazukommen.
