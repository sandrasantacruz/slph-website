# Schema-Spezifikation — PocketBase Collections

> Dies ist **nur** die Spezifikation der Collections — die Wahrheit über das
> Soll. Das Schema selbst lebt in PocketBase. Angelegt/geändert wird es über die
> **Collections-API oder das Dashboard** gegen den lokalen Dev-Server (Ablauf →
> `apps/backend/CLAUDE.md`); die Datei in `apps/backend/migrations/` schreibt
> `Automigrate` dabei selbst. **Migrationen niemals von Hand schreiben.**
> Der Go-Code setzt genau dieses Schema voraus.
>
> Getestet gegen die im Projekt eingebundene Version **PocketBase v0.39.4**
> (neue Collections-/Field-API mit eigenständigen `autodate`-Feldern).
>
> **Stand: Multi-Tenant (M0).** Seit Durchgang M0 läuft paula mandantenfähig in
> **einer** DB (viele Restaurants). Die Tenant-Wurzel ist die Collection
> `restaurants`; jede fachliche Collection trägt eine Pflicht-Relation
> `restaurant`. Siehe Abschnitt „Multi-Tenant" unten.

---

## Designentscheidungen (Grundlage des Schemas)

Diese drei Punkte sind mit dem Auftraggeber geklärt und prägen das Schema:

1. **Auth & Berechtigungen:** Eine eigene `users`-Auth-Collection mit Multi-Select
   `permissions` (statt einer einzelnen Rolle). Leeres `permissions` = Kellner
   (lesen + Reservierungen); erhöhte Backoffice-Rechte (`floor`, `shifts`, …)
   schalten die Konfiguration frei. API-Regeln sind permission-basiert (Details
   im Abschnitt „Multi-Tenant").
2. **Freeze ist abgeleitet, nicht gespeichert.** Es gibt **keine** eigene
   „Schicht-Instanz/Service"-Collection. „Eingefroren" gilt, sobald
   *jetzt ≥ (Datum + Schicht-Startzeit − 15 Min)* in der lokalen Restaurant-
   Zeitzone. Der „Snapshot" ist schlicht die zuletzt berechnete und ab dem
   Freeze **nicht mehr** neu berechnete Zuweisung auf den Reservierungen.
3. **Zuweisung als Felder auf der Reservierung.** Jede Reservierung trägt
   optional `assigned_table` **oder** `assigned_group`. Neuberechnung = Update
   dieser Felder auf den betroffenen Reservierungen. Gut realtime-fähig.

**Wichtig — was NICHT im Schema steckt** (sondern serverseitig im Go-Hook, ab
Durchgang 2): die Machbarkeitsprüfung („ausgebucht ja/nein"), die automatische
Zuweisung, die Serialisierung pro Schicht und die Freeze-Regel. PocketBase-
API-Regeln sind **record-level**, nicht feldfeinkörnig — sie regeln hier nur
*wer* lesen/schreiben darf, nicht *ob die Belegung passt*.

---

## Multi-Tenant (Mandantenfähigkeit)

paula ist mandantenfähig in **einer** PocketBase-DB. Festlegungen (M0):

- **Tenant = Restaurant.** Die Collection `restaurants` ist die Tenant-Wurzel;
  jede fachliche Collection (`users`, `shifts`, `tables`, `table_groups`,
  `reservations`) trägt eine **Pflicht-Relation `restaurant`**.
- **Ein Nutzer = ein Restaurant** (`users.restaurant`, Single-Relation). Es gibt
  **keine** tenant-übergreifende App-Rolle.
- **Plattform-Betreiber = PB-Superuser** (`_superusers`). Der Superuser umgeht
  alle Collection-Regeln und ist der **einzige** tenant-übergreifende Zugriff;
  er legt Restaurants und Nutzer an (Onboarding vorerst manuell).
- **Isolation per API-Regeln UND Go-Hooks.** Die API-Regeln scopen jeden
  Lese-/Schreibzugriff (gilt auch für Realtime) auf
  `restaurant = @request.auth.restaurant`; zusätzlich filtern die Go-Hooks alle
  Ladevorgänge der Zuweisung auf das Restaurant der Reservierung (kein Tisch/keine
  Gruppe eines fremden Restaurants kann je in eine Zuweisung gelangen).
- **`restaurant` wird beim Create autoritativ vom Go-Hook** aus dem eingeloggten
  Nutzer gesetzt (kein Client-Spoofing); die Regeln sind die zweite Absicherung.

### Berechtigungen statt Rolle

Statt eines einzelnen `role`-Felds tragen Nutzer ein Multi-Select **`permissions`**
(seit M0). Modell:

- **Baseline „Kellner" = leeres `permissions`.** Jeder eingeloggte Mitarbeiter des
  Restaurants darf alles **lesen** und **Reservierungen** aufnehmen/ändern.
- **`permissions`** sind die *erhöhten* Backoffice-Fähigkeiten darüber. Werte:
  - `floor` — Tische + Tischgruppen (Tischplan)
  - `shifts` — Schichten
  - `menu` — Produkte/Speisekarte *(Folgeschritt, noch keine Collection)*
  - `website` — Webseite *(Folgeschritt, noch keine Collection)*
  - `staff` — Mitarbeiter/Berechtigungen verwalten *(Folgeschritt)*
- Die API-Regeln prüfen die Mitgliedschaft pro Collection mit
  `@request.auth.permissions ~ "<wert>"`. **Wichtig:** In PB v0.39.4 matcht der
  „any"-Operator `?=` auf einem Multi-Select **nicht** (liefert 0 Treffer → führt zu
  404 beim Schreiben); es funktioniert nur `~` (contains). `~` ist ein Substring-Match;
  das ist hier unkritisch, weil die Werte (`floor`/`shifts`/`menu`/`website`/`staff`)
  keine Teilstrings voneinander sind. Käme je ein überlappender Wert hinzu (z. B.
  `floor_admin`), nähme man die exakte Form `~ '"floor"'` (trifft den JSON-Token mit
  Anführungszeichen).

---

## Collections-Überblick

| Collection      | Typ   | Zweck                                                              |
|-----------------|-------|--------------------------------------------------------------------|
| `restaurants`   | base  | **Tenant-Wurzel** — Identität/Routing + `active`-Kill-Switch (Superuser) |
| `site_settings` | base  | Präsentations-Config (Theme/Sprachen/Kontakt) — **Tenant pflegt**, 1:1 |
| `restaurant_billing` | base | Plan/Status/Quotas — **privat** (owner read, Superuser write), 1:1 |
| `users`         | auth  | Personal-Login mit Backoffice-`permissions`                        |
| `shifts`        | base  | Konfigurierbare Schichten (Vorlagen, ohne Datum)                   |
| `tables`        | base  | Konfigurierbare Tische inkl. Position & Kapazität                  |
| `zones`         | base  | Räume/Bereiche des Plans (Tabs) mit optionalem Hintergrundbild     |
| `table_groups`  | base  | Tischkombinationen mit **manueller** Max-Personenzahl              |
| `reservations`  | base  | Reservierungen inkl. (provisorischer/eingefrorener) Zuweisung      |
| `pages`         | base  | Page-Builder-Inhalt (Draft `blocks` + publizierter Snapshot)       |
| `routes`        | base  | Öffentliche URL-Alias-Tabelle (i18n-Routing, indizierter Lookup)   |
| `media`         | base  | Bild-Bibliothek (konvertiertes WebP + Maße/Fokus/Platzhalter)      |
| `categories`    | base  | Speisekarten-Kategorien (lokalisiert)                              |
| `products`      | base  | Produkte/Gerichte (lokalisiert, Preis sprachneutral)              |
| `posts`         | base  | Blog-Artikel (lokalisierter Prosa-Body als HTML, Draft + Snapshot) |
| `post_categories` | base | Blog-Kategorien (lokalisiert, vom Tenant gepflegt)                |
| `webhooks`      | base  | Ausgehende Trigger bei Inhaltsänderungen (entprellt), z. B. Build-Pipeline |
| `webhook_deliveries` | base | Zustellungs-Historie der Webhooks (**nur Server schreibt**, 30 Tage) |

Systemfelder `id` (15-stelliger Text) werden von PocketBase automatisch
angelegt. `created`/`updated` werden als explizite **`autodate`**-Felder
ergänzt (in der neuen PocketBase-Version nicht mehr implizit). Auth-Collections
bringen zusätzlich `email`, `password`, `tokenKey`, `verified`,
`emailVisibility` automatisch mit.

---

## 0. `restaurants` — Tenant-Wurzel / Plattform-Governance (Base)

Ein Datensatz je Restaurant. **Nur Superuser schreibt.** Hält **Identität, Routing
und den `active`-Kill-Switch** — die *präsentationale* Website-Config (Theme,
Sprachen, Kontakt) liegt in **`site_settings`**, Plan/Billing in
**`restaurant_billing`** (Aufteilung nach Berechtigungs-Achse, siehe unten).

| Feld       | Typ      | Pflicht | Optionen / Constraints              | Beschreibung                                   |
|------------|----------|---------|-------------------------------------|------------------------------------------------|
| `name`     | text     | **ja**  | —                                   | Anzeigename des Restaurants                    |
| `domain`   | text     | **ja**  | **unique** (Unique-Index)           | **voller Host** des Restaurants — Subdomain (`name.pulpo.cloud`) ODER eigene Domain (`max-mustermann.de`). Tenant-Auflösung: `domain == host`. **lowercase** speichern |
| `timezone` | text     | **ja**  | default `Europe/Berlin`             | lokale Zeitzone (Freeze-Logik)                 |
| `active`   | bool     | **ja**  | —                                   | **Kill-Switch** (Missbrauch/nicht gezahlt) — die öffentliche Seite filtert auf `active = true` |
| `created`  | autodate | —       | onCreate                            | automatisch                                    |
| `updated`  | autodate | —       | onCreate + onUpdate                 | automatisch                                    |

**API-Regeln**

| Regel       | Wert        | Begründung                                          |
|-------------|-------------|-----------------------------------------------------|
| List/Search | *(leer)*    | **öffentlich lesbar** (Host-Auflösung der Seite)    |
| View        | *(leer)*    |                                                     |
| Create/Update/Delete | *(leer)* | gesperrt → nur Superuser                    |

> **Host-getriebene Tenant-Auflösung (kein Slug, kein ROOT-Domain-Env):** `restaurants.
> domain` trägt den vollen Host. `getRestaurantByHost(host)` und der Caddy-`ask`-Endpunkt
> machen EINEN Lookup `domain == host` — deckt Subdomains UND eigene Domains gleich ab.
> Onboarding: `domain = <gewählt>.pulpo.cloud`; später überschreibbar auf die eigene Domain
> (die Subdomain ist danach weg — kein Redirect). **Dev:** `domain = demo.localhost`.

> **Warum die Aufteilung in drei Collections?** PB-Regeln sind **record-level, nicht
> feldfein** — man kann nicht „Kunde darf `theme`, aber nicht `active`/`domain`".
> Daher ein Tisch je **(Sichtbarkeit × Hoheit)**: `restaurants` (public/Superuser),
> `site_settings` (public/Tenant), `restaurant_billing` (owner/Superuser). Governance-
> Felder sind so **strukturell** dicht, nicht per Hook-Disziplin.

> **Kill-Switch:** `active = false` ⇒ der `ask`-Endpunkt verweigert das Zert und
> `getRestaurantByHost` filtert `active = true` → Seite findet keinen Tenant.

> `domain` braucht einen **Unique-Index** (`CREATE UNIQUE INDEX … ON restaurants (domain)`) —
> verhindert, dass zwei Restaurants denselben Host beanspruchen (mehrdeutige Auflösung).

> **Künftige Self-Service-Registrierung** (Kunde wählt das Label selbst): Label
> **server-seitig** validieren — Format `^[a-z0-9-]+$`, **reservierte Labels sperren**
> (`www`, `admin`, `api`, `app`, `agenda`, Apex), Eindeutigkeit. Nie nur im Frontend.

> **Public-Read-Entscheidung:** Die öffentliche Seite liest server-seitig **anonym**.
> Daher sind `restaurants`, `site_settings`, `routes`, `pages`, `media`, `categories`,
> `products` öffentlich lesbar (kein Service-Token). `restaurant_billing` ist **nicht**
> public. Caveat: record-level ⇒ ein öffentlich lesbarer `pages`-Record gibt technisch
> auch Draft-`blocks` preis (gerendert wird nur `publishedBlocks`).

---

## 0a. `site_settings` — Präsentations-Config (Base, **Tenant pflegt**)

1:1 zu `restaurants`. Hält alles, was der Kunde selbst pflegen darf.

| Feld           | Typ      | Pflicht | Optionen / Constraints                | Beschreibung                          |
|----------------|----------|---------|---------------------------------------|---------------------------------------|
| `restaurant`   | relation | **ja**  | → `restaurants`; single; **Unique-Index** | Tenant (1:1)                      |
| `defaultLang`  | text     | nein    | z. B. `de`; Default `de`              | Standardsprache (ohne URL-Prefix)     |
| `locales`      | json     | nein    | z. B. `["de","es"]`; leer ⇒ `[defaultLang]`; **geordnet**, keine Mengen-Grenze | aktive Sprachen (Reihenfolge = Switcher-Anzeige) |
| `localeFlags`  | json     | nein    | Map `Sprachcode → Ländercode`, z. B. `{"en":"gb","es":"mx"}` | Flagge je Sprache (ISO 3166-1 alpha-2); fehlt ein Eintrag, leitet `resolveFlag` (@repo/site) sie aus dem Sprachcode ab |
| `theme`        | json     | nein    | CSS-Var-Map, Werte **oklch**          | White-Label-Farben                    |
| `logo`         | file     | nein    | single                                | Logo                                  |
| `contactEmail` / `contactPhone` | text | nein | —                          | öffentliche Kontaktdaten              |
| `street`/`zip`/`city`/`countryCode` | text | nein | ISO-Land z. B. `DE`        | Adresse (sprachneutral)               |
| `lat`/`lng`    | number   | nein    | Dezimal (onlyInt = false)             | Geo                                   |
| `mapHref`      | url      | nein    | —                                     | Link zu Maps                          |
| `openingHours` | json     | nein    | `[{daysLabel,hoursText,additionalInfo}]`, Werte **lokalisiert** | Öffnungszeiten als Zeilen freien Texts (s. u.) |
| `contacts`     | json     | nein    | `[{type,url,label,title,subtitle,action}]`, Texte **lokalisiert** | Kontakt-Kacheln (E-Mail/Telefon/WhatsApp …) mit Call-to-Action |
| `social`       | json     | nein    | `{instagram,facebook,…}`              | Social-Links (Map; neue Plattform = kein Schema-Change) |
| `created`/`updated` | autodate | —  | —                                     | automatisch                           |

> **Warum `openingHours` freier Text und keine `[{day,from,to}]`-Struktur ist:**
> Reale Öffnungszeiten fassen Tage zusammen und haben Pausen — „Mittwoch – Samstag",
> „13:00 - 17:00 | 20:00 - 00:00", „Dienstag / Geschlossen". Eine Wochentag-Zahl mit
> genau einem Von–Bis müsste das in mehrere Zeilen zerlegen und könnte „Mo–Fr" nicht
> als **eine** Zeile ausgeben; die Zusammenfassung wäre Anzeige-Logik, die jede Seite
> neu erfinden müsste. Deshalb pflegt der Kunde die Zeilen so, wie sie erscheinen
> sollen. Die **Reihenfolge im Array ist die Anzeige-Reihenfolge** (kein `sort`-Feld).
>
> ```jsonc
> [
>   { "daysLabel":      { "es": "Miércoles - Sábado", "de": "Mittwoch - Samstag" },
>     "hoursText":      { "es": "13:00 - 17:00 | 20:00 - 00:00" },
>     "additionalInfo": { "es": "" } }
> ]
> ```
> Jeder Text ist eine **L10n-Map** (`{sprachcode: text}`) wie `categories.name` — fehlt
> eine Sprache, fällt die Seite auf `defaultLang` zurück. Zeiten stehen dadurch meist
> nur einmal (sprachneutral), Wörter wie „Geschlossen" je Sprache.

> **`contacts`** sind die Kontakt-Kacheln der öffentlichen Seite (Kontakt-Block,
> Standort-Block, Impressum/Datenschutz). `type` ist ein freier Kennstring
> (`email`, `tel`, `whatsapp`, …) — die Seite wählt darüber Icon und Darstellung und
> findet z. B. die Impressums-Adresse per `type === "email"`. `url` ist das fertige
> Ziel inklusive Schema (`mailto:`, `tel:`, `https://wa.me/…`). Reihenfolge im Array
> = Anzeige-Reihenfolge.
>
> ```jsonc
> [
>   { "type": "whatsapp", "url": "https://wa.me/34608963438",
>     "label":    { "es": "608963438" },
>     "title":    { "es": "WhatsApp", "de": "WhatsApp" },
>     "subtitle": { "es": "Gestionamos tu reserva…", "de": "Wir kümmern uns…" },
>     "action":   { "es": "Chat & Reservas", "de": "Chat & Reservierungen" } }
> ]
> ```
>
> **Bewusst KEIN eigenes Feld je Plattform** (weder bei `social` noch hier): eine neue
> Plattform oder ein zweiter WhatsApp-Anschluss ist so ein Datensatz mehr, keine
> Migration. Preis dafür: PB validiert die Form nicht — das tun das Admin-Formular
> (zod) und der Konsument.

**API-Regeln**

| Regel       | Wert                                                                              | Begründung                          |
|-------------|-----------------------------------------------------------------------------------|-------------------------------------|
| List/View   | *(leer)*                                                                           | öffentlich (Theme/Sprachen der Seite) |
| Create      | *(leer)*                                                                           | Provisioning per Go-Hook (Tenant darf nicht selbst anlegen) |
| Update      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"`  | Kunde pflegt seine Config           |
| Delete      | *(leer)*                                                                           | nur Superuser                       |

> **1:1 sicherstellen:** `site_settings.create` ist für den Tenant gesperrt → die Zeile
> legt der **Go-Hook** `internal/website` bei `restaurants`-Create automatisch an
> (Defaults `defaultLang=de`, `locales=["de"]`). Bestandsrestaurants brauchen die Zeile
> einmalig nachträglich.

---

## 0b. `restaurant_billing` — Plan / Abrechnung / Quotas (Base, **privat**)

1:1 zu `restaurants`. **Nicht öffentlich** — nur der Eigentümer liest seinen Plan,
schreiben darf nur der Superuser.

| Feld                | Typ      | Pflicht | Optionen / Constraints                        | Beschreibung                  |
|---------------------|----------|---------|-----------------------------------------------|-------------------------------|
| `restaurant`        | relation | **ja**  | → `restaurants`; single; **Unique-Index**     | Tenant (1:1)                  |
| `plan`              | select   | **ja**  | `free`,`starter`,`pro`; maxSelect 1           | Tarifstufe                    |
| `billingStatus`     | select   | **ja**  | `trialing`,`active`,`past_due`,`canceled`     | Zahlungs-/Account-Zustand     |
| `billingRef`        | text     | nein    | **hidden**                                    | Stripe-ID (auch dem Tenant verborgen) |
| `currentPeriodEnd`  | text     | nein    | ISO-Datum                                     | nächste Verlängerung / Dunning |
| `trialEndsAt`       | text     | nein    | ISO-Datum                                     | Testphase-Ende                |
| `maxPages` / `maxProducts` / `maxMediaItems` / `maxLocales` | number | nein | onlyInt; **leer = Plan-Default** | Quota-Overrides |
| `customDomainAllowed` | bool   | nein    | —                                             | Capability-Flag               |
| `modules`           | select   | nein    | `website`,`blog`,`menu`,`agenda`; **maxSelect 4** | gebuchte Module — **leer = alle** |
| `created`/`updated` | autodate | —       | —                                             | automatisch                   |

**API-Regeln**

| Regel       | Wert                                      | Begründung                             |
|-------------|-------------------------------------------|----------------------------------------|
| List/View   | `restaurant = @request.auth.restaurant`   | Eigentümer sieht seinen Plan (Admin)   |
| Create/Update/Delete | *(leer)*                         | nur Superuser (Provisioning per Go-Hook, Defaults `free`/`trialing`) |

> **Quotas:** Plan ist die Wahrheit, die Quota-Felder sind **Overrides** (leer ⇒
> Plan-Default aus einer `plan → limits`-Map im Code). Durchsetzung per Go-Hook beim
> Create von `pages`/`products`/`media` (zählen kann keine API-Regel). **0-als-blank**
> (PB v0.39.4): leeres Quota-Feld = „Plan-Default", nicht „0 erlaubt".

> **`modules` = Feature-Toggle je Kunde.** Nicht jeder bucht alles (nur Speisekarte,
> nur Agenda, nur Webbuilder). Das Multi-Select steuert, welche Bereiche im Back Office
> erscheinen (`/admin`-Sidebar + Routen) und ob die Kellner-App `/agenda` nutzbar ist.
> Es liegt hier und nicht in `site_settings`, weil es eine **kommerzielle** Grenze ist:
> owner-read/Superuser-write ⇒ der Tenant kann sich nichts selbst freischalten.
> **Leer ⇒ alle Module an** (0-als-blank-Logik analog zu den Quotas): Bestandszeilen und
> ein noch nicht angelegtes Feld sperren niemanden aus; erst eine bewusste Auswahl
> blendet aus. Frontend: `parseModules`/`useModules` in `packages/api/src/modules.ts`.
> **UI-Schranke, keine Datengrenze** — die Autorisierung bleiben die API-Regeln.

> **`active` bleibt der Schalter, `billingStatus` der Grund.** Enforcement läuft über
> `restaurants.active`; ein späterer Billing-Webhook kippt `active`, wenn der Status auf
> `canceled`/`past_due` springt.

---

## 1. `users` (Auth-Collection)

Beim Anlegen Collection-Typ **Auth** wählen → email/password etc. sind dann
vorhanden. Zusätzliche Felder:

| Feld          | Typ      | Pflicht | Optionen / Constraints                                  | Beschreibung                          |
|---------------|----------|---------|---------------------------------------------------------|---------------------------------------|
| `name`        | text     | nein    | max 200                                                 | Anzeigename des Mitarbeiters          |
| `permissions` | select   | nein    | **maxSelect > 1** (Mehrfach); Werte: `floor`, `shifts`, `menu`, `website`, `staff` | Erhöhte Backoffice-Rechte; leer = Kellner |
| `restaurant`  | relation | **ja**  | → `restaurants`; maxSelect **1**                        | Tenant-Zugehörigkeit des Nutzers — bei Betreibern das **aktive** Restaurant |
| `platformAdmin` | bool   | nein    | default `false`                                         | **Plattform-Betreiber** (Konsole `/admin/plattform`) |
| `homeRestaurant` | relation | nein  | → `restaurants`; maxSelect **1**                        | Heim-Restaurant des Betreibers (Rückweg aus dem Support-Modus) |
| `created`     | autodate | —       | onCreate                                                | automatisch                           |
| `updated`     | autodate | —       | onCreate + onUpdate                                     | automatisch                           |

> **Berechtigungen statt Rolle:** Das frühere `role`-Feld (`admin`/`waiter`) ist
> durch das Multi-Select `permissions` ersetzt (siehe Abschnitt „Multi-Tenant →
> Berechtigungen statt Rolle"). Leeres `permissions` = reiner Kellner (lesen +
> Reservierungen). Die Werte `menu`/`website`/`staff` sind vorbereitet, ohne dass
> es dafür schon Collections/Seiten gibt.

**API-Regeln**

| Regel       | Wert                            | Begründung                                          |
|-------------|---------------------------------|-----------------------------------------------------|
| List/Search | `restaurant = @request.auth.restaurant` | Personal desselben Restaurants ist sichtbar  |
| View        | `restaurant = @request.auth.restaurant` |                                              |
| Create      | *(leer)*                        | gesperrt → nur Superuser (Onboarding manuell)       |
| Update      | `id = @request.auth.id`         | jeder ändert nur den eigenen Datensatz              |
| Delete      | *(leer)*                        | gesperrt → nur Superuser                            |
| Auth (Manage)| *(leer)*                       | gesperrt → nur Superuser (Personalverwaltung später)|

> **Abweichung von der reinen „nur sich selbst"-Sicht:** list/view sind bewusst
> **restaurant-weit** (Kellner sehen ihre Kolleg:innen desselben Restaurants),
> nicht auf `id = @request.auth.id` beschränkt. Tenant-sicher bleibt es, weil der
> Scope das Restaurant ist.
>
> Restaurants, den ersten Nutzer je Restaurant und dessen `permissions` legt der
> Superuser im Dashboard an. Superuser umgehen alle Regeln ohnehin.

> **Privilegierte Felder sind gegen Selbst-Änderung gepinnt** (`internal/platform/guards.go`):
> Die Update-Regel `id = @request.auth.id` prüft in PB die **gespeicherte** Zeile, nicht
> den Body (Memory `pb-update-rule-checks-preupdate-row`) — ohne Hook könnte jeder
> Mitarbeiter per PATCH auf sich selbst `restaurant` auf ein **fremdes** Restaurant
> setzen (voller Zugriff auf dessen Daten) oder sich `permissions` verleihen. Der Hook
> setzt `restaurant`, `permissions`, `platformAdmin`, `homeRestaurant` bei jedem
> `users`-Request auf den Bestandswert zurück. Superuser-Requests (`_superusers`)
> bleiben unangetastet; Go-Tests: `go test ./internal/platform/`.

> **Plattform-Betreiber statt Superuser-Alltag:** `platformAdmin = true` schaltet die
> Konsole `/admin/plattform` frei (alle Restaurants, Module schalten, Session in ein
> Restaurant umschalten). Der Wechsel schreibt `users.restaurant` des Betreibers —
> deshalb ändert sich **keine einzige API-Regel**: der Betreiber ist im Support-Modus
> ein ganz normaler Mitarbeiter dieses Restaurants. PB lädt den Auth-Record pro Request
> frisch, der Wechsel wirkt also sofort mit demselben Token. Beim ersten Wechsel merkt
> sich der Endpunkt `homeRestaurant` (Rückweg). Routen: `/api/platform/*`
> (`apps/backend/internal/platform`), UI-Banner in Admin **und** Agenda.
> Der PB-Superuser bleibt für Schema, Onboarding und Notfälle zuständig.

---

## 2. `shifts` — Schichten (Base)

Konfigurierbare Schicht-**Vorlagen** ohne Datum. Eine Reservierung verknüpft
Datum + genau eine dieser Schichten.

| Feld         | Typ      | Pflicht | Optionen / Constraints                              | Beschreibung                          |
|--------------|----------|---------|-----------------------------------------------------|---------------------------------------|
| `name`       | text     | **ja**  | max 100                                             | z. B. „Mittag", „Abend"               |
| `start_time` | text     | **ja**  | Pattern `^([01]\d|2[0-3]):[0-5]\d$`                 | Startzeit `HH:MM` (lokale Restaurant-Zeit) |
| `end_time`   | text     | **ja**  | Pattern `^([01]\d|2[0-3]):[0-5]\d$`                 | Endzeit `HH:MM`                       |
| `restaurant` | relation | **ja**  | → `restaurants`; maxSelect **1**                    | Tenant-Zugehörigkeit                  |
| `created`    | autodate | —       | onCreate                                            | automatisch                           |
| `updated`    | autodate | —       | onCreate + onUpdate                                 | automatisch                           |

**Hinweise**
- Zeiten als reine Uhrzeit-Strings, weil eine Schicht eine Vorlage ohne Datum
  ist (PocketBase hat keinen reinen „Time"-Typ). Datum kommt erst über die
  Reservierung dazu.
- **Über-Mitternacht-Schichten** (z. B. `22:00`–`02:00`): erlaubt. Die Go-Logik
  interpretiert `end_time < start_time` als „endet am Folgetag". Für den Freeze
  zählt ausschließlich `start_time`.
- Eine Reservierung gehört zu **genau einer** Schicht und erstreckt sich nie
  über mehrere (Teil A).

**API-Regeln**

| Regel       | Wert                                                                          | Begründung                                       |
|-------------|-------------------------------------------------------------------------------|--------------------------------------------------|
| List/Search | `restaurant = @request.auth.restaurant`                                       | Kellner brauchen Schichten für die Eingabemaske  |
| View        | `restaurant = @request.auth.restaurant`                                       |                                                  |
| Create      | `@request.body.restaurant = @request.auth.restaurant && @request.auth.permissions ~ "shifts"` | Schichtverwaltung nur mit `shifts`-Recht (im eigenen Restaurant) |
| Update      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "shifts"` |                                               |
| Delete      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "shifts"` |                                               |

---

## 3. `tables` — Tische (Base)

| Feld       | Typ      | Pflicht | Optionen / Constraints              | Beschreibung                          |
|------------|----------|---------|-------------------------------------|---------------------------------------|
| `name`     | text     | **ja**  | max 50                              | Name/Nummer des Tisches               |
| `capacity` | number   | **ja**  | min 1; **nur Ganzzahl** (onlyInt)   | Sitzplätze (Personen)                 |
| `pos_x`    | number   | **ja**  | —                                   | X-Position im Plan                    |
| `pos_y`    | number   | **ja**  | —                                   | Y-Position im Plan                    |
| `shape`    | select   | —       | maxSelect **1**; Werte `round`, `square`, `rect` | Tischform im Canvas-Editor (leer = Default `rect`) |
| `width`    | number   | —       | min 1; nur Ganzzahl                 | Breite der Tischkachel in Plan-Pixeln (leer = aus Form+Kapazität abgeleitet) |
| `height`   | number   | —       | min 1; nur Ganzzahl                 | Höhe der Tischkachel in Plan-Pixeln (leer = abgeleitet) |
| `rotation` | number   | —       | nur Ganzzahl (0–359)                | Drehung der Kachel in Grad (leer/0 = keine Drehung) |
| `seats`    | json     | —       | Array `[{x,y}]`, x/y ∈ 0..1         | Eigene Sitzanordnung (normalisiert, relativ zur Kachel); leer/Länge≠`capacity` = automatische Verteilung |
| `zone`     | relation | **ja**  | → `zones`; maxSelect **1**; cascadeDelete **false** | Raum/Bereich (Tab im Plan-Editor); **Pflicht** — jeder Tisch gehört zu genau einer Zone |
| `restaurant` | relation | **ja** | → `restaurants`; maxSelect **1**    | Tenant-Zugehörigkeit                  |
| `created`  | autodate | —       | onCreate                            | automatisch                           |
| `updated`  | autodate | —       | onCreate + onUpdate                 | automatisch                           |

**Hinweise**
- `pos_x`/`pos_y` sind freie Plan-Koordinaten (Plan-Pixel, gleiche Einheit wie
  `width`/`height`). `pos_x`/`pos_y` markieren die linke obere Ecke der Kachel.
- `shape`/`width`/`height`/`rotation` sind **bewusst optional** (nicht Pflicht):
  Bestandstische ohne diese Felder bleiben gültig, das Frontend leitet fehlende
  Werte aus Form + Kapazität ab. **Pflicht-`number` würde `0` als „leer" ablehnen**
  (Memory `pb-required-number-zero-blank`) — `rotation` braucht aber `0` als
  Normalfall, daher optional. Der Canvas-Editor (`apps/admin`, `@xyflow/react`)
  schreibt diese Felder beim Anlegen/Verschieben/Skalieren/Drehen.
- `seats` ist eine **eigene Sitzanordnung** (Stühle frei am Tischrand platziert,
  inkl. über Eck). Normalisiert (x,y ∈ 0..1) → unabhängig von Größe/Drehung. Greift
  nur, wenn die Anzahl zur `capacity` passt; sonst (z. B. nach Kapazitätsänderung
  oder Form-Wechsel) verteilt das Frontend automatisch. Der Sitz-Editor schreibt
  `seats` **und** `capacity` (Anzahl Stühle = Plätze) zusammen.
- **Anlegen im PB-Admin** (Reihenfolge): Feld `shape` als `select` (single,
  Werte `round`/`square`/`rect`), `width`/`height`/`rotation` als `number`
  (optional), `seats` als `json` (optional). Danach `pnpm typegen` → die
  Interim-Typen im Frontend entfallen.
- `zone` ist eine **Pflicht**-Einzel-Relation auf `zones` (Räume/Bereiche, s. 3a):
  jeder Tisch gehört zu genau einer Zone. Der Plan-Editor zeigt je Zone einen Tab;
  ohne angelegte Zone lässt sich **kein** Tisch anlegen (das Frontend führt zuerst
  zur Bereichs-Anlage). `cascadeDelete: false` — beim Löschen einer Zone bleibt der
  Tisch-Datensatz erhalten (das Frontend muss ihn neu zuordnen). **Anlegen**: Feld
  `zone` als `relation` → `zones`, maxSelect 1, **required**. (Erst die Collection
  `zones` anlegen, dann dieses Feld.)

**API-Regeln**

| Regel       | Wert                                                                         | Begründung                              |
|-------------|------------------------------------------------------------------------------|-----------------------------------------|
| List/Search | `restaurant = @request.auth.restaurant`                                      | Tischplan/Anzeige für alle Mitarbeiter  |
| View        | `restaurant = @request.auth.restaurant`                                      |                                         |
| Create      | `@request.body.restaurant = @request.auth.restaurant && @request.auth.permissions ~ "floor"` | Tischverwaltung nur mit `floor`-Recht  |
| Update      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "floor"` | (auch Verschieben im Plan)           |
| Delete      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "floor"` |                                       |

---

## 3a. `zones` — Räume / Bereiche (Base)

Optionale Gliederung des Tischplans in Bereiche (z. B. „Innen", „Terrasse",
„Bar"). Im Plan-Editor wird je Zone ein Tab gezeigt; ein **Hintergrundbild**
(Foto/Grundriss des echten Raums) kann hinter die Tische gelegt werden.

| Feld         | Typ      | Pflicht | Optionen / Constraints                        | Beschreibung                                       |
|--------------|----------|---------|-----------------------------------------------|----------------------------------------------------|
| `name`       | text     | **ja**  | max 60                                        | Bereichsname (Tab-Label)                           |
| `sort`       | number   | —       | nur Ganzzahl                                  | Reihenfolge der Tabs (leer = nach Name)            |
| `bg_image`   | file     | —       | **single**; MIME `image/*`; maxSize ~5 MB     | Hintergrund-Floorplan (clientseitig zu WebP, ≤1600px) |
| `bg_opacity` | number   | —       | 0–100                                         | Deckkraft des Hintergrunds in % (leer = 60)        |
| `bg_scale`   | number   | —       | nur Ganzzahl                                  | Skalierung des Hintergrundbilds in % (leer = 100)  |
| `restaurant` | relation | **ja**  | → `restaurants`; maxSelect **1**              | Tenant-Zugehörigkeit                               |
| `created`    | autodate | —       | onCreate                                      | automatisch                                        |
| `updated`    | autodate | —       | onCreate + onUpdate                           | automatisch                                        |

**API-Regeln** (wie `tables`: lesen alle Mitarbeiter, schreiben nur mit `floor`):

| Regel       | Wert                                                                                           |
|-------------|------------------------------------------------------------------------------------------------|
| List/View   | `restaurant = @request.auth.restaurant`                                                        |
| Create      | `@request.body.restaurant = @request.auth.restaurant && @request.auth.permissions ~ "floor"`   |
| Update      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "floor"`                 |
| Delete      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "floor"`                 |

**Anlegen** (vor dem `tables.zone`-Feld): Collection `zones` (Base) mit obigen
Feldern. `bg_opacity`/`bg_scale`/`sort` als **optionale** `number` (0 als „leer"-
Falle, daher optional). Danach `tables.zone` anlegen, dann `pnpm typegen`.

---

## 4. `table_groups` — Tischgruppen / Kombinationen (Base)

| Feld           | Typ      | Pflicht | Optionen / Constraints                                  | Beschreibung                                   |
|----------------|----------|---------|---------------------------------------------------------|------------------------------------------------|
| `name`         | text     | **ja**  | max 100                                                 | z. B. „Fenster A+B"                            |
| `tables`       | relation | **ja**  | → `tables`; **maxSelect: leer (∞)**, **minSelect: 2**; cascadeDelete **false** | Die zur Gruppe kombinierten Tische             |
| `max_capacity` | number   | **ja**  | min 1; **nur Ganzzahl** (onlyInt)                       | **Manuell** gesetzte Max-Personenzahl der Gruppe |
| `restaurant`   | relation | **ja**  | → `restaurants`; maxSelect **1**                        | Tenant-Zugehörigkeit                           |
| `created`      | autodate | —       | onCreate                                                | automatisch                                    |
| `updated`      | autodate | —       | onCreate + onUpdate                                     | automatisch                                    |

**Hinweise (zentral für Teil A)**
- `max_capacity` ist **nicht** die Summe der Einzelkapazitäten, sondern eine
  eigenständige, manuell gepflegte Zahl (an berührenden Tischkanten passen
  weniger Personen). Die Go-Logik nutzt für Gruppen **immer** `max_capacity`.
- `tables` ist eine **Mehrfach-Relation** (mind. 2 Tische). Diese Relation
  definiert die **physische Überlappung**: belegt eine Gruppe einen Tisch, ist
  derselbe Tisch weder einzeln noch in einer anderen Gruppe verfügbar — das ist
  der Set-Packing-Charakter aus Teil A. (Durchsetzung im Go-Algorithmus, nicht
  im Schema.)
- `cascadeDelete = false`: Wird ein Tisch gelöscht, soll **nicht** die ganze
  Gruppe gelöscht werden; PocketBase entfernt den Tisch automatisch aus der
  Relationsliste. (Admin sollte `max_capacity` danach prüfen.)
- **Keine doppelten Kombinationen** — **Unique-Index** auf (`restaurant`, `tables`):
  `CREATE UNIQUE INDEX idx_table_groups_restaurant_tables ON table_groups (restaurant, tables)`.
  **Voraussetzung:** PocketBase speichert die Multi-Relation als JSON-Array in
  Eingabe-Reihenfolge (`["A","B"]` ≠ `["B","A"]`) — der Go-Hook **kanonisiert**
  `tables` daher bei Create UND Update (sortiert + dedupliziert,
  `canonicalizeGroupTables` in `internal/reservations/config_guard.go`); erst
  dadurch ist „gleiche Tisch-Menge" = „gleicher Spaltenwert". Bestehende
  Duplikate (auch nur reihenfolge-verschiedene) VOR dem Anlegen des Index
  bereinigen, sonst schlägt das Speichern der Collection fehl; Altbestände mit
  unsortierter Reihenfolge werden beim nächsten Update automatisch kanonisch.
  Das Frontend zeigt die Verletzung als „existiert bereits"
  (`isUniqueViolation` in `@repo/api`).

**API-Regeln**

| Regel       | Wert                                                                         | Begründung                                |
|-------------|------------------------------------------------------------------------------|-------------------------------------------|
| List/Search | `restaurant = @request.auth.restaurant`                                      | Gruppen für Anzeige/Algorithmus lesbar    |
| View        | `restaurant = @request.auth.restaurant`                                      |                                           |
| Create      | `@request.body.restaurant = @request.auth.restaurant && @request.auth.permissions ~ "floor"` | Gruppen-Editor nur mit `floor`-Recht     |
| Update      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "floor"` |                                          |
| Delete      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "floor"` |                                          |

---

## 5. `reservations` — Reservierungen (Base)

Kernobjekt. Kellner tragen die fachlichen Felder ein; **Tisch wählt der Kellner
nicht**. Die Felder `assigned_table` / `assigned_group` werden ausschließlich
vom Go-Hook gesetzt (siehe „Invarianten & serverseitige Hoheit").

| Feld             | Typ      | Pflicht | Optionen / Constraints                                              | Beschreibung                                         |
|------------------|----------|---------|--------------------------------------------------------------------|------------------------------------------------------|
| `guest_name`     | text     | **ja**  | max 200                                                            | Gastname                                             |
| `party_size`     | number   | **ja**  | min 1; **nur Ganzzahl** (onlyInt)                                  | Personenzahl                                         |
| `date`           | text     | **ja**  | Pattern `^\d{4}-\d{2}-\d{2}$`                                       | Service-Tag `YYYY-MM-DD` (lokale Restaurant-Zeit)    |
| `shift`          | relation | **ja**  | → `shifts`; maxSelect **1**; cascadeDelete **false**               | Zugehörige Schicht                                   |
| `phone`          | text     | nein    | max 50                                                             | optionale Telefonnummer                              |
| `note`           | text     | nein    | max 1000                                                          | optionale Notiz                                      |
| `assigned_table` | relation | nein    | → `tables`; maxSelect **1**; cascadeDelete **false**               | Vom System zugewiesener Einzeltisch (oder leer)      |
| `assigned_group` | relation | nein    | → `table_groups`; maxSelect **1**; cascadeDelete **false**         | Vom System zugewiesene Gruppe (oder leer)            |
| `arrived`        | date     | nein    | optional; leer = Gast noch nicht da                                | Ankunftszeit des Gasts (Kellner toggelt per Doppeltipp in der Agenda; Zeitstempel statt Bool — so ist auch das „Wann" festgehalten) |
| `forced`         | bool     | nein    | Default false                                                     | Überbuchung: vom Kellner trotz „Ausgebucht" erzwungen. Überspringt das Machbarkeits-Gate; Zuweisung nur best-effort (kann leer bleiben). Forcierte Reservierungen fließen NICHT in die Machbarkeitsrechnung normaler Buchungen ein. |
| `restaurant`     | relation | **ja**  | → `restaurants`; maxSelect **1**                                  | Tenant-Zugehörigkeit (Go-Hook setzt sie beim Create) |
| `created`        | autodate | —       | onCreate                                                          | automatisch                                          |
| `updated`        | autodate | —       | onCreate + onUpdate                                               | automatisch                                          |

**Warum `date` als Text `YYYY-MM-DD` (statt date-Feld):** Ein Service-Tag ist
ein Kalendertag in der lokalen Restaurant-Zeitzone, kein Zeitpunkt. PocketBase-
`date`-Felder speichern UTC-Zeitstempel, was bei reiner Datumshaltung zu
Zeitzonen-Drift („welcher Tag?") führen kann. Als Text ist der Service-Tag
eindeutig, und die Freeze-Rechnung (`date` + `shift.start_time` in lokaler TZ)
bleibt unzweideutig. Sortierung/Filter funktionieren auf dem Textformat
genauso.

**API-Regeln**

| Regel       | Wert                                              | Begründung                                                                 |
|-------------|---------------------------------------------------|----------------------------------------------------------------------------|
| List/Search | `restaurant = @request.auth.restaurant`           | Mitarbeiter sehen alle Reservierungen ihres Restaurants (Plan + Realtime)  |
| View        | `restaurant = @request.auth.restaurant`           |                                                                            |
| Create      | `@request.body.restaurant = @request.auth.restaurant` | Jeder eingeloggte Mitarbeiter darf aufnehmen (kein Permission-Recht nötig); der Go-Hook setzt `restaurant` autoritativ und prüft die **Machbarkeit** („ausgebucht") |
| Update      | `restaurant = @request.auth.restaurant`           | Änderung (z. B. Personenzahl) → Hook rechnet Schicht neu                    |
| Delete      | `restaurant = @request.auth.restaurant`           | Stornierung → Hook rechnet Schicht neu                                      |

> Die Create-/Update-Regel gestattet **technisch** das Anlegen; die eigentliche
> Annahme-/Ablehnungsentscheidung („passt noch?" / „ausgebucht") trifft der
> serialisierte Go-Hook (`OnRecordCreateRequest` etc.) ab Durchgang 2. Eine
> reine API-Regel kann das nicht leisten.

**Empfohlene Indizes**
- Zusammengesetzter Index auf (`date`, `shift`) — der Algorithmus lädt immer
  „alle Reservierungen einer Schicht an einem Datum".
- Optional Index auf `shift` (für Aufräum-/Konsistenzabfragen).

**Stornierung:** wird als **Löschen** des Datensatzes abgebildet (kein
Status-Feld). Das `OnRecordDelete*`-Event triggert die Neuberechnung der
Schicht. (Falls später eine Historie gewünscht ist, ließe sich ein
`cancelled`-Bool ergänzen — bewusst weggelassen, um schlank zu bleiben.)

---

## 6. `pages` — Page-Builder-Inhalt (Base)

Eine Zeile je Seite (über alle Sprachen). `pageKey` ist die **stabile Identität**
einer Seite über alle Sprachversionen; die Übersetzungen leben **in** den Block-
Textfeldern (`LocalizedText`-Maps), nicht in getrennten Records.

| Feld              | Typ      | Pflicht | Optionen / Constraints                          | Beschreibung                                       |
|-------------------|----------|---------|-------------------------------------------------|----------------------------------------------------|
| `restaurant`      | relation | **ja**  | → `restaurants`; maxSelect **1**                | Tenant-Zugehörigkeit                               |
| `pageKey`         | text     | **ja**  | —                                               | stabile Seiten-ID über alle Sprachen (z. B. `home`, `contact`) |
| `blocks`          | json     | nein    | Block-Liste                                     | **Arbeitsstand (Draft)** — vom Editor live bearbeitet |
| `publishedBlocks` | json     | nein    | Block-Liste                                     | **Snapshot** für die öffentliche Seite (nur dieser wird gerendert) |
| `seo`             | json     | nein    | pro Sprache `{title,description}`               | z. B. `{"de":{"title":"…"}}`                       |
| `status`          | select   | nein    | Werte `draft`, `published`; maxSelect **1**     | Veröffentlichungsstatus                            |
| `created`         | autodate | —       | onCreate                                        | automatisch                                        |
| `updated`         | autodate | —       | onCreate + onUpdate                             | automatisch                                        |

- **Unique-Index** auf (`restaurant`, `pageKey`).
- **Blocks sind JSON, keine typisierten Spalten.** PB validiert das Block-JSON
  **nicht** — die Formgarantie lebt im TS-Typ (`packages/site/src/types.ts`) und
  im Back-Office-Editor. Neue Komponente = neuer `type`-String + Renderer-Case +
  Editor-Feld, **keine** Migration.

**API-Regeln**

| Regel       | Wert                                                                              | Begründung                                         |
|-------------|-----------------------------------------------------------------------------------|----------------------------------------------------|
| List/Search | *(leer = öffentlich)*                                                              | öffentliche Seite liest server-seitig anonym (Public-Read, s. o.) |
| View        | *(leer = öffentlich)*                                                              |                                                    |
| Create      | `@request.body.restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"` | Website-Pflege braucht `website`-Recht |
| Update      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"`  |                                                    |
| Delete      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"`  |                                                    |

---

## 7. `routes` — öffentliche URL-Alias-Tabelle (Base)

Kern des i18n-Routings: indizierter Lookup `restaurant && lang && slug → page`.
Mehrere routes (eine je Sprache) zeigen auf **dieselbe** `pages`-Zeile.

| Feld         | Typ      | Pflicht | Optionen / Constraints                          | Beschreibung                                  |
|--------------|----------|---------|-------------------------------------------------|-----------------------------------------------|
| `restaurant` | relation | **ja**  | → `restaurants`; maxSelect **1**                | Tenant-Zugehörigkeit                          |
| `lang`       | text     | **ja**  | **expliziter** Sprachcode (auch die Standardsprache, z. B. `de`) | Sprachcode der Variante       |
| `slug`       | text     | nein    | `""` = Landing                                  | übersetzter URL-Slug                          |
| `page`       | relation | nein    | → `pages`; maxSelect **1**; cascadeDelete **true** | Zielseite (**oder** `post`, s. u.)         |
| `post`       | relation | nein    | → `posts`; maxSelect **1**; cascadeDelete **true** | Ziel-Artikel (**oder** `page`)             |
| `created`    | autodate | —       | onCreate                                        | automatisch                                   |
| `updated`    | autodate | —       | onCreate + onUpdate                             | automatisch                                   |

> **Konvention `lang` (wichtig — stimmt mit dem Code überein):** `lang` trägt den
> **expliziten** Sprachcode, **auch für die Standardsprache** (`de`, nicht `""`).
> Der Daten-Layer löst eine prefix-lose URL auf `lang = defaultLang` auf
> (`resolveLangAndSlug`) und filtert `routes` exakt darauf — würde die
> Standardsprache als `""` gespeichert, fänden alle Standardsprach-Seiten (inkl.
> Landing) **keine** Route → 404. Nur `slug` nutzt `""` (= Landing). Das
> URL-Schema bleibt unverändert: Standardsprache **ohne** Prefix, andere mit.

- **Unique-Index** auf (`restaurant`, `lang`, `slug`).
- **Reservierte Slugs:** aktive Sprachcodes als Slug sperren (Kollision `/en` vs.
  englische Landing) — Durchsetzung im Back Office; der Unique-Index ist die
  zweite Absicherung.
- **Go-Hook:** `routes.page`/`routes.post` müssen zum selben `restaurant` gehören
  (PB validiert Relationen nur auf Existenz, nicht auf Tenant) — siehe
  „serverseitige Hoheit".
- **Genau EINES von `page`/`post`** ist gesetzt. Beide Felder sind in PB optional
  (ein `required` je Feld ginge nicht), die Entweder-oder-Regel erzwingt der
  Go-Hook. **Seiten und Artikel teilen sich denselben Namensraum** — der
  Unique-Index verhindert damit automatisch, dass ein Artikel-Slug eine Seite
  verdeckt.
- **Artikel-URLs sind gewöhnliche Slugs mit Schrägstrich**, z. B.
  `blog/mein-artikel`. `resolveLangAndSlug` joint die Pfadsegmente mit `/`, das
  Routing in `[[...path]]` musste dafür **nicht** angefasst werden. Die
  Blog-Übersicht ist eine normale `pages`-Zeile mit einem `postList`-Block und
  hat damit ebenfalls einen übersetzten Slug.

**API-Regeln**

| Regel       | Wert                                                                              | Begründung                          |
|-------------|-----------------------------------------------------------------------------------|-------------------------------------|
| List/Search | *(leer = öffentlich)*                                                              | Routing-Lookup der öffentlichen Seite |
| View        | *(leer = öffentlich)*                                                              |                                     |
| Create      | `@request.body.restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"` | |
| Update      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"`  |                                     |
| Delete      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"`  |                                     |

---

## 8. `media` — Bild-Bibliothek (Base)

| Feld          | Typ      | Pflicht | Optionen / Constraints                          | Beschreibung                                  |
|---------------|----------|---------|-------------------------------------------------|-----------------------------------------------|
| `restaurant`  | relation | **ja**  | → `restaurants`; maxSelect **1**                | Tenant-Zugehörigkeit                          |
| `file`        | file     | **ja**  | single; fertig konvertiertes 800×800-WebP       | das Bild                                      |
| `width`       | number   | nein    | onlyInt                                         | feste `<img>`-Breite (Layout-Shift-Schutz)    |
| `height`      | number   | nein    | onlyInt                                         | feste `<img>`-Höhe                            |
| `alt`         | json     | nein    | LOKALISIERT (`{de,es,…}`)                       | Default-Alternativtext                        |
| `focalX`      | number   | **nein** | 0–1, Default 0.5 (**nicht required!**)         | Fokuspunkt X (CSS object-position)            |
| `focalY`      | number   | **nein** | 0–1, Default 0.5 (**nicht required!**)         | Fokuspunkt Y                                  |
| `placeholder` | text     | nein    | BlurHash / LQIP-Data-URI                        | gegen Aufblitzen                              |
| `bgColor`     | text     | nein    | Hex                                             | Dominantfarbe (Fallback)                      |
| `label`       | text     | nein    | —                                               | menschlicher Name für die Bibliothek          |
| `tags`        | json     | nein    | z. B. `["food","interior"]`                     | Filterung                                     |
| `decorative`  | bool     | nein    | Default false                                   | → `alt=""` im Renderer                        |
| `archived`    | bool     | nein    | Default false                                   | Soft-Delete (Verwaisungs-Schutz, §9)          |
| `created`     | autodate | —       | onCreate                                        | automatisch                                   |
| `updated`     | autodate | —       | onCreate + onUpdate                             | automatisch                                   |

> **PB-Fallstrick (Memory `pb-required-number-zero-blank`):** Auf einem
> **required**-Number-Feld gilt `0` als „blank". `focalX`/`focalY` deshalb
> **nicht required** machen (oder serverseitig defaulten) — sonst scheitert ein
> Fokuspunkt am linken/oberen Rand (`0`). Der Daten-Layer defaultet fehlende
> Werte ohnehin auf `0.5`.

> **Verwaisungs-Schutz (§9):** `media` wird aus Block-JSON referenziert — PB kennt
> das **nicht** als echte Relation. Statt Hard-Delete `archived` setzen, oder vor
> dem Löschen im Go-Hook prüfen, ob die `mediaId` noch in `blocks`/`publishedBlocks`
> referenziert wird.

**API-Regeln**

| Regel       | Wert                                                                              | Begründung                          |
|-------------|-----------------------------------------------------------------------------------|-------------------------------------|
| List/Search | *(leer = öffentlich)*                                                              | Bilder der öffentlichen Seite       |
| View        | *(leer = öffentlich)*                                                              |                                     |
| Create      | `@request.body.restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"` | |
| Update      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"`  |                                     |
| Delete      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"`  |                                     |

---

## 9. `categories` — Speisekarten-Kategorien (Base)

| Feld         | Typ      | Pflicht | Optionen / Constraints                          | Beschreibung                                  |
|--------------|----------|---------|-------------------------------------------------|-----------------------------------------------|
| `restaurant` | relation | **ja**  | → `restaurants`; maxSelect **1**                | Tenant-Zugehörigkeit                          |
| `name`       | json     | **ja**  | LOKALISIERT (`{de,es,…}`)                       | Kategorie-Name                                |
| `position`   | number   | nein    | onlyInt                                         | Sortierung                                    |
| `image`      | file     | nein    | single                                          | optionales Kategorie-Bild (Client lädt WebP ≤1000px) |
| `focalX`     | number   | nein    | 0–1, Default 0.5 (**nicht required!**)          | Fokuspunkt X (CSS object-position)            |
| `focalY`     | number   | nein    | 0–1, Default 0.5 (**nicht required!**)          | Fokuspunkt Y                                  |
| `alt`        | json     | nein    | LOKALISIERT                                     | Alt-Text des Bildes (Barrierefreiheit)        |
| `created`    | autodate | —       | onCreate                                        | automatisch                                   |
| `updated`    | autodate | —       | onCreate + onUpdate                             | automatisch                                   |

**API-Regeln** (identisches Muster; Schreibrechte über `permissions ~ "menu"`)

| Regel       | Wert                                                                            | Begründung                       |
|-------------|---------------------------------------------------------------------------------|----------------------------------|
| List/Search | *(leer = öffentlich)*                                                            | Speisekarte der öffentlichen Seite |
| View        | *(leer = öffentlich)*                                                            |                                  |
| Create      | `@request.body.restaurant = @request.auth.restaurant && @request.auth.permissions ~ "menu"` | Menü-Pflege braucht `menu`-Recht |
| Update      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "menu"`   |                                  |
| Delete      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "menu"`   |                                  |

---

## 10. `products` — Produkte/Gerichte (Base)

| Feld          | Typ      | Pflicht | Optionen / Constraints                          | Beschreibung                                  |
|---------------|----------|---------|-------------------------------------------------|-----------------------------------------------|
| `restaurant`  | relation | **ja**  | → `restaurants`; maxSelect **1**                | Tenant-Zugehörigkeit                          |
| `category`    | relation | **ja**  | → `categories`; maxSelect **1**; cascadeDelete **true** | Zugehörige Kategorie (Kategorie löschen löscht ihre Produkte mit) |
| `name`        | json     | **ja**  | LOKALISIERT                                     | Produktname                                   |
| `description` | json     | nein    | LOKALISIERT                                     | Beschreibung                                  |
| `price`       | number   | nein    | **sprachneutral**                               | Betrag (z. B. 18 → 18,00 €)                   |
| `image`       | file     | nein    | single                                          | Produktbild (Client lädt WebP ≤1000px)        |
| `available`   | bool     | nein    | Default true                                    | im Renderer ausgeblendet, wenn false          |
| `position`    | number   | nein    | onlyInt                                         | Sortierung innerhalb der Kategorie            |
| `focalX`      | number   | nein    | 0–1, Default 0.5 (**nicht required!**)          | Fokuspunkt X (CSS object-position)            |
| `focalY`      | number   | nein    | 0–1, Default 0.5 (**nicht required!**)          | Fokuspunkt Y                                  |
| `alt`         | json     | nein    | LOKALISIERT                                     | Alt-Text des Bildes (Barrierefreiheit)        |
| `note`        | json     | nein    | LOKALISIERT                                     | Freie Kennzeichnung (z. B. „Hausgemacht")     |
| `allergens`   | json     | nein    | `string[]` (EU-14-Keys, App-Katalog)            | Allergene (Mehrfachauswahl)                   |
| `labels`      | json     | nein    | `string[]` (Tag-Keys, App-Katalog)              | Kennzeichnungen/Tags (Vegan, Highlight …)     |
| `created`     | autodate | —       | onCreate                                        | automatisch                                   |
| `updated`     | autodate | —       | onCreate + onUpdate                             | automatisch                                   |

- **Go-Hook:** `products.category` muss zum selben `restaurant` gehören
  (Cross-Tenant-Konsistenz, da PB nur Existenz prüft).

**API-Regeln** (Schreibrechte über `permissions ~ "menu"`, sonst wie `categories`).

| Regel       | Wert                                                                            | Begründung                       |
|-------------|---------------------------------------------------------------------------------|----------------------------------|
| List/Search | *(leer = öffentlich)*                                                            | Speisekarte der öffentlichen Seite |
| View        | *(leer = öffentlich)*                                                            |                                  |
| Create      | `@request.body.restaurant = @request.auth.restaurant && @request.auth.permissions ~ "menu"` | |
| Update      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "menu"`   |                                  |
| Delete      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "menu"`   |                                  |

---

## 11. `webhooks` — ausgehende Trigger (Base)

Vom Tenant gepflegte Endpunkte, die bei Inhaltsänderungen **entprellt** (debounced)
angerufen werden — typischer Fall: eine Build-Pipeline (GitHub `repository_dispatch`,
Vercel/Netlify Deploy-Hook) neu bauen lassen, wenn ein Preis geändert oder ein Produkt
angelegt wurde. Verdrahtung: `apps/backend/internal/webhooks`.

| Feld               | Typ      | Pflicht | Optionen / Constraints                                                   | Beschreibung                                                     |
|--------------------|----------|---------|--------------------------------------------------------------------------|------------------------------------------------------------------|
| `restaurant`       | relation | **ja**  | → `restaurants`; maxSelect **1**                                         | Tenant-Zugehörigkeit                                             |
| `name`             | text     | **ja**  | max 200                                                                  | Anzeigename (z. B. „Website-Build")                              |
| `url`              | url      | **ja**  | nur `http`/`https`                                                       | Ziel-Endpunkt                                                    |
| `collections`      | select   | **ja**  | **maxSelect 7**; Werte `products`, `categories`, `media`, `pages`, `routes`, `site_settings`, `restaurants` | Welche Collections diesen Hook auslösen                          |
| `secret`           | text     | nein    | max 200                                                                  | HMAC-Secret → Header `X-Webhook-Signature: sha256=<hex>`; leer = keine Signatur |
| `headers`          | json     | nein    | maxSize 4096; `{"Header":"Wert"}`                                        | Zusätzliche Request-Header (z. B. `Authorization` für GitHub)    |
| `payload`          | json     | nein    | maxSize 4096                                                             | **Ersetzt** den Standard-Body wörtlich (z. B. `{"event_type":"rebuild"}`); leer = Standard-Zusammenfassung |
| `active`           | bool     | nein    | Default false                                                            | Aus = wird nie zugestellt                                        |
| `debounce_seconds` | number   | nein    | onlyInt; min 0, max 900                                                  | Entprell-Fenster; **leer/0 = Server-Default 60 s**, Dispatcher klammert auf 5–900 |
| `last_status`      | number   | nein    | onlyInt                                                                  | HTTP-Status der letzten Zustellung (Diagnose, vom Hook geschrieben) |
| `last_error`       | text     | nein    | max 500                                                                  | Fehlertext der letzten Zustellung (leer = Erfolg)                |
| `last_triggered`   | date     | nein    | —                                                                        | Zeitpunkt der letzten Zustellung                                 |
| `created`          | autodate | —       | onCreate                                                                 | automatisch                                                      |
| `updated`          | autodate | —       | onCreate + onUpdate                                                      | automatisch                                                      |

**Hinweise**
- Die Werte von `collections` müssen mit `internal/webhooks.WatchedCollections`
  übereinstimmen — kommt eine Collection dazu, **beides** ändern (Select-Werte per
  Collections-API, Go-Map im Code).
- `debounce_seconds` ist ein **festes**, kein gleitendes Fenster: der Timer startet
  mit der ersten Änderung eines Bursts und wird von späteren Änderungen **nicht**
  zurückgesetzt. Sonst würde ein Dauerstrom von Schreibvorgängen (Seed, Massen-Import)
  die Zustellung unbegrenzt hinausschieben.
- `last_status`/`last_error`/`last_triggered` sind **denormalisierte Diagnose** („zuletzt");
  die vollständige Historie steht in `webhook_deliveries` (§12).
- `debounce_seconds`, `last_status`, `last_error` sind bewusst **nicht required** —
  `required`-Number würde `0` als „leer" ablehnen (Memory `pb-required-number-zero-blank`).

**API-Regeln** — auch **Lesen** verlangt das `website`-Recht, weil der Record ein
Secret hält und ausgehende Requests steuert (anders als bei `media`/`categories`,
wo nur Schreiben gated ist).

| Regel       | Wert                                                                               | Begründung                                        |
|-------------|------------------------------------------------------------------------------------|---------------------------------------------------|
| List/Search | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"`   | enthält `secret` → nicht für jeden Kellner sichtbar |
| View        | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"`   |                                                   |
| Create      | `@request.body.restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"` |                                        |
| Update      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"`   |                                                   |
| Delete      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"`   |                                                   |

**Indizes:** `idx_webhooks_restaurant` auf (`restaurant`) — der Dispatcher lädt je
Tenant die aktiven Hooks.

---

## 12. `webhook_deliveries` — Zustellungs-Historie (Base, **nur Server schreibt**)

Append-only-Protokoll: ein Record je Zustellung (nach allen Retries). Damit lässt
sich ein fehlgeschlagener Build nachvollziehen, ohne im Server-Log zu suchen.

| Feld            | Typ      | Pflicht | Optionen / Constraints                                        | Beschreibung                                        |
|-----------------|----------|---------|---------------------------------------------------------------|-----------------------------------------------------|
| `restaurant`    | relation | **ja**  | → `restaurants`; maxSelect **1**                              | Tenant-Zugehörigkeit                                |
| `webhook`       | relation | **ja**  | → `webhooks`; maxSelect **1**; cascadeDelete **true**         | Hook löschen räumt seine Historie mit ab            |
| `success`       | bool     | nein    | —                                                             | Zustellung erfolgreich (2xx)                        |
| `status`        | number   | nein    | onlyInt                                                       | HTTP-Status (0 = Verbindung kam nie zustande)       |
| `error`         | text     | nein    | max 500                                                       | Fehlertext inkl. Antwort-Auszug des Empfängers      |
| `collections`   | json     | nein    | `string[]`                                                    | Welche Collections den Burst ausgelöst haben        |
| `changes_count` | number   | nein    | onlyInt                                                       | Anzahl gebündelter Änderungen (inkl. abgeschnittener) |
| `attempts`      | number   | nein    | onlyInt                                                       | Zustellversuche (1–3)                               |
| `url`           | text     | nein    | max 500                                                       | Ziel-URL zum Zeitpunkt der Zustellung               |
| `created`       | autodate | —       | onCreate                                                      | automatisch                                         |

**Hinweise**
- **Retention:** ein Cron (`webhook-deliveries-purge`, nachts 3:50) löscht Einträge
  älter als 30 Tage in Häppchen von 500 — die Collection wächst also nicht unbegrenzt.
- Der Dispatcher schreibt über `app.Save` (Model- statt Request-Hook) und **umgeht
  damit die API-Regeln** — deshalb sind create/update/delete komplett gesperrt.

**API-Regeln**

| Regel       | Wert                                                                             | Begründung                              |
|-------------|-----------------------------------------------------------------------------------|-----------------------------------------|
| List/Search | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"` | wie `webhooks` (nennt die Ziel-URL)     |
| View        | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"` |                                         |
| Create      | *(leer)*                                                                          | gesperrt → nur der Server via `app.Save` |
| Update      | *(leer)*                                                                          | append-only                             |
| Delete      | *(leer)*                                                                          | gesperrt → nur der Purge-Cron           |

**Indizes:** `idx_webhook_deliveries_webhook_created` auf (`webhook`, `created`) —
die Log-Ansicht liest je Hook nach Zeit absteigend.

> **Blog:** `collections` kennt zusätzlich `posts` und `post_categories`
> (`maxSelect` **9**) — sonst könnte kein Tenant einen Build auf Artikeländerungen
> triggern.

---

## 13. `posts` — Blog-Artikel **und Veranstaltungen** (Base)

**Eine Collection für beides**, unterschieden über `kind`. Der Grund: identisch
ist die ganze teure Maschinerie (lokalisierter Fließtext + Sanitizing, Bilder als
`data-media-id`, übersetzte Slugs über `routes`, SEO, Draft/Publish, DeepL);
unterschiedlich sind eine Handvoll Felder und die Sortierung. Eine zweite
Collection hätte Editor, Sanitizing-Hook und Routen-Verdrahtung verdoppelt.

Eine Zeile je Artikel (über alle Sprachen), exakt nach dem Muster von `pages`:
`postKey` ist die **stabile Identität** über alle Sprachversionen, die
Übersetzungen leben **in** den lokalisierten Feldern (`LocalizedText`-Maps),
nicht in getrennten Records. Ein Übersetzungs-Gruppenschlüssel ist deshalb
**nicht** nötig — es gibt nichts zu joinen.

| Feld             | Typ      | Pflicht | Optionen / Constraints                        | Beschreibung                                          |
|------------------|----------|---------|-----------------------------------------------|-------------------------------------------------------|
| `restaurant`     | relation | **ja**  | → `restaurants`; maxSelect **1**; cascadeDelete **true** | Tenant-Zugehörigkeit                       |
| `postKey`        | text     | **ja**  | —                                             | stabile Artikel-ID über alle Sprachen                 |
| `kind`           | select   | nein    | `article`, `event`; maxSelect **1**           | **leer = `article`** — deshalb brauchten die Bestandsartikel keine Datenmigration |
| `visibleFrom`    | date     | nein    | —                                             | **geplantes Erscheinen**; leer = sofort (s. API-Regel) |
| `startsAt`       | date     | nein    | Pflicht nur für `kind=event` (Go-Hook)        | wann die Veranstaltung stattfindet                     |
| `endsAt`         | date     | nein    | ≥ `startsAt` (Go-Hook)                        | Ende mehrtägiger Veranstaltungen                       |
| `location`       | json     | nein    | LOKALISIERT (`{de,es,…}`)                     | Ort in Worten („Im Innenhof")                          |
| `mapEmbed`       | text     | nein    | max 2000; **nur die geprüfte URL**            | Google-Maps-Einbettung (§13a)                          |
| `title`          | json     | nein    | LOKALISIERT (`{de,es,…}`)                     | Überschrift                                            |
| `teaser`         | json     | nein    | LOKALISIERT                                   | Anriss für Listen + `og:description`-Fallback         |
| `body`           | json     | nein    | **pro Sprache HTML** (`{de:"<p>…"}`)          | **Arbeitsstand (Draft)** — vom Editor live bearbeitet |
| `publishedBody`  | json     | nein    | pro Sprache HTML                              | **Snapshot** für die öffentliche Seite                |
| `coverImage`     | relation | nein    | → `media`; maxSelect **1**; cascadeDelete **false** | Titelbild (Teaser + `og:image`)                  |
| `category`       | relation | nein    | → `post_categories`; maxSelect **1**          | Blog-Kategorie                                         |
| `status`         | select   | **ja**  | Werte `draft`, `published`; maxSelect **1**   | Veröffentlichungsstatus                               |
| `publishedAt`    | date     | nein    | —                                             | Anzeige-/Sortierdatum, **bewusst getrennt** von `created` |
| `author`         | text     | nein    | max 200                                       | Freitext (kein `users`-Bezug — überlebt Personalwechsel) |
| `tags`           | json     | nein    | `string[]`                                    | freie Schlagworte neben der Kategorie                 |
| `seo`            | json     | nein    | pro Sprache `{title,description,ogImageId,noindex}` | Meta-Overrides                                  |
| `created`        | autodate | —       | onCreate                                      | automatisch                                            |
| `updated`        | autodate | —       | onCreate + onUpdate                           | automatisch                                            |

- **Unique-Index** auf (`restaurant`, `postKey`); zusätzlicher Index auf
  (`restaurant`, `status`, `publishedAt`) für die Listenabfrage der Seite.
- **Der Body ist HTML, kein Block-JSON.** PB validiert ihn **nicht** — die
  Sicherheitsgarantie liegt im **serverseitigen Sanitizing** (`internal/blog`,
  bluemonday), nicht im Editor. Bilder stehen als `<img data-media-id="…">` drin,
  **nie** mit fertiger URL: sonst friert das HTML den PB-Dateinamen ein und ein
  späterer Wechsel bricht jeden Altartikel.
- **Verwaisungs-Schutz (§9) gilt auch hier:** die `data-media-id`-Attribute im
  Artikel-HTML zählen als Media-Referenz und müssen vor dem Löschen eines
  `media`-Records mitgeprüft werden.

- **Sortierung unterscheidet sich nach `kind`:** Artikel absteigend nach
  `publishedAt` (neueste zuerst), Events **aufsteigend** nach `startsAt` — und
  Events **verfallen**: ein vergangenes gehört nicht mehr in „Demnächst", bleibt
  aber über seine URL erreichbar (der Link wurde vielleicht geteilt).
  Index dafür: (`restaurant`, `kind`, `status`, `startsAt`).

**API-Regeln** — bewusst **strenger als `pages`**

| Regel       | Wert                                                                              | Begründung                                              |
|-------------|-----------------------------------------------------------------------------------|---------------------------------------------------------|
| List/Search | `(status = 'published' && (visibleFrom = '' \|\| visibleFrom <= @now)) \|\| (restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website")` | Entwürfe **und geplante** Beiträge sind nicht öffentlich — ein embargierter Artikel darf nicht vorab über die API abrufbar sein (bei `pages` ist alles public-read) |
| View        | *(wie List)*                                                                       |                                                         |

> **`@now` ist ein PB-Makro** (v0.39.4, `tools/search/identifier_macros.go`) —
> damit ist geplantes Erscheinen **serverseitig** durchgesetzt, nicht nur in der
> Abfrage ausgeblendet. Verifiziert: ohne `visibleFrom` und mit Datum in der
> Vergangenheit anonym sichtbar, mit Datum in der Zukunft **nicht** — der eigene
> Tenant sieht es weiterhin (sonst wäre es im Back Office unbearbeitbar).
>
> ⚠️ **Der Next-Cache erfährt davon nichts.** `apps/web` cacht die gerenderte
> Ausgabe und invalidiert nur über den `tenant:<id>`-Tag, den der Go-Hook bei
> **Schreibvorgängen** feuert — beim Erreichen von `visibleFrom` schreibt aber
> niemand. Dafür gibt es den Cron `posts-visibility` (stündlich); ohne ihn
> erschiene der Beitrag erst, wenn die Cache-Lebensdauer abläuft.
| Create      | `@request.body.restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"` | |
| Update      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"`  |                                                         |
| Delete      | `restaurant = @request.auth.restaurant && @request.auth.permissions ~ "website"`  |                                                         |

### §13a — `mapEmbed`: nur die geprüfte URL

Das Feld hält **ausschließlich die `src`-URL** einer Google-Maps-Einbettung, nie
Googles kompletten `<iframe>`-Schnipsel. Gespeichertes Fremd-Markup müsste später
ungeprüft ausgegeben werden — genau das, wogegen das Sanitizing existiert. Den
iframe baut der Renderer selbst (`MapEmbed` in `@repo/site`), mit eigenen
Attributen (responsiv, `loading="lazy"`, `referrerpolicy`, `title`).

Der Go-Hook `normalizeMapEmbedField` (`internal/blog/mapembed.go`) zieht die URL
aus der Eingabe — der Redakteur darf den ganzen Schnipsel einfügen — und prüft
sie. **Erlaubt ist nur** `https` auf `www.google.com` / `google.com` /
`maps.google.com` mit Pfad **`/maps/embed`**. Der Host-Vergleich ist exakt
(kein Suffix-Match), sonst käme `www.google.com.beispiel.test` durch.

> **Häufigster Bedienfehler:** der „Teilen"-Link (`maps.app.goo.gl/…`,
> `/maps/place/…`) sieht fast gleich aus, ist aber KEINE Einbettung und rendert
> im iframe nichts. Er wird mit Klartext abgelehnt statt still eine leere Karte
> zu erzeugen.

---

## 14. `post_categories` — Blog-Kategorien (Base)

Vom **Tenant selbst gepflegt** und mehrsprachig. Bewusst **nicht** die
Speisekarten-`categories` (§9) mitbenutzt: die trägt Menü-Semantik (Produkte,
Reihenfolge im Menü) und wird von `getCategoriesWithProducts` und dem
`menu`-Block gelesen — sie mit Blog-Rubriken zu teilen hieße, zwei Bedeutungen
in eine Tabelle zu mischen.

Artikel- und Veranstaltungs-Rubriken liegen dagegen sehr wohl **hier zusammen**,
getrennt über `kind` — analog zu `posts` (§13) und aus demselben Grund: identisch
sind Name, Slug und Sortierung, unterschiedlich ist nur, wo sie auftauchen.

| Feld         | Typ      | Pflicht | Optionen / Constraints                          | Beschreibung                                  |
|--------------|----------|---------|-------------------------------------------------|-----------------------------------------------|
| `restaurant` | relation | **ja**  | → `restaurants`; maxSelect **1**; cascadeDelete **true** | Tenant-Zugehörigkeit                 |
| `name`       | json     | **ja**  | LOKALISIERT (`{de,es,…}`)                       | Anzeigename                                    |
| `kind`       | select   | nein    | `article`, `event`; maxSelect **1**             | **leer = `article`** — trennt Blog- von Veranstaltungs-Rubriken |
| `slug`       | json     | nein    | LOKALISIERT                                     | je Sprache, für spätere Archiv-URLs            |
| `position`   | number   | nein    | onlyInt                                         | Sortierung                                     |
| `created`    | autodate | —       | onCreate                                        | automatisch                                    |
| `updated`    | autodate | —       | onCreate + onUpdate                             | automatisch                                    |

- **Index** auf (`restaurant`). Kein Unique-Index auf `name` — PB kann JSON nicht
  eindeutig indizieren; Dubletten fängt das Back Office ab.
- **Archiv-Seiten (`/blog/kategorie/…`) sind noch nicht verdrahtet** — `slug` ist
  vorbereitet, damit das später ohne Migration nachrüstbar ist. Im Back Office
  ist das Feld deshalb eingeklappt.
- **`kind` muss die Oberfläche filtern**, sonst stehen Veranstaltungs-Rubriken in
  der Kategorie-Auswahl eines Blog-Artikels (genau das passierte, als das Feld
  angelegt, aber noch nicht ausgewertet wurde).

**API-Regeln:** wie `pages` (List/View öffentlich; Create/Update/Delete mit
`website`-Recht auf dem eigenen Tenant).

---

## Invarianten & serverseitige Hoheit (kein Schema, aber hier dokumentiert)

Folgendes wird **nicht** durch das Schema, sondern durch den Go-Hook
(Durchgang 2) bzw. die Zuweisungslogik (Durchgang 1) garantiert:

1. **Genau eine Zuweisung:** Auf einer platzierten Reservierung ist **entweder**
   `assigned_table` **oder** `assigned_group` gesetzt, nie beides, nie keins
   (solange platziert). Client-seitig gesetzte Werte werden vom Hook
   **überschrieben** (der Kellner wählt keinen Tisch).
2. **Kein Tisch doppelt belegt** und **Gruppe vs. ihre Einzeltische nie
   gleichzeitig** belegt (Set-Packing/Überlappung).
3. **Kapazität:** `party_size ≤ capacity` (Einzeltisch) bzw.
   `party_size ≤ max_capacity` (Gruppe).
4. **Freeze:** abgeleitet aus `date` + `shift.start_time` − 15 Min (lokale TZ).
   Vor Freeze: komplette Neuberechnung erlaubt. Nach Freeze: nur additive
   Platzierung in tatsächlich freie, nicht umstellbare Optionen.
5. **Serialisierung pro Schicht** (Mutex/Transaktion), damit zwei gleichzeitige
   Buchungen nicht beide ein „passt noch" bekommen.

Abgeleitete Anzeigewerte (kein Speicher nötig): **Auslastung** und der
**Gesamtzähler** der platzierten Personen je Datum+Schicht werden aus den
Reservierungen berechnet.

---

## Reihenfolge beim Anlegen (Admin oder Collections-API)

Wegen der Relationen in dieser Reihenfolge anlegen — egal ob geklickt oder per
`PATCH /api/collections/<name>` (Ablauf → `apps/backend/CLAUDE.md`):

1. `restaurants` — **ersten Datensatz** setzen (Tenant-Wurzel; `slug` als
   **Unique-Index**; Felder `name`/`slug`/`timezone`/`active`/`customDomain`;
   list/view **leer = öffentlich**, Schreiben nur Superuser)
1a. `site_settings` — Relation → `restaurants` (**Unique-Index**), Präsentations-
   Config; list/view **leer**, update `~ "website"`, create/delete leer (Go-Hook
   provisioniert die 1:1-Zeile)
1b. `restaurant_billing` — Relation → `restaurants` (**Unique-Index**); `billingRef`
   **hidden**; list/view `restaurant = @request.auth.restaurant`, Schreiben nur Superuser
2. `users` (Auth) — `restaurant`-Relation + `permissions` setzen, ersten Nutzer
   anlegen (per Superuser/Dashboard)
3. `shifts` (Relation → `restaurants`)
4. `tables` (Relation → `restaurants`)
4a. `zones` (Relation → `restaurants`; `bg_image` als **single** file, `bg_opacity`/
   `bg_scale`/`sort` als **optionale** `number`), danach Feld **`tables.zone`**
   (Relation → `zones`, maxSelect 1, optional, cascadeDelete false)
5. `table_groups` (Relationen → `tables`, `restaurants`)
6. `reservations` (Relationen → `shifts`, `tables`, `table_groups`, `restaurants`)
7. `pages` (Relation → `restaurants`; **Unique-Index** (`restaurant`,`pageKey`))
8. `routes` (Relationen → `restaurants`, `pages`; **Unique-Index**
   (`restaurant`,`lang`,`slug`); `page` cascadeDelete **true**)
9. `media` (Relation → `restaurants`; `focalX`/`focalY` **nicht required**)
10. `categories` (Relation → `restaurants`)
11. `products` (Relationen → `restaurants`, `categories`)
12. `webhooks` (Relation → `restaurants`; Index auf `restaurant`; **auch Lesen**
   verlangt `permissions ~ "website"`)
13. `webhook_deliveries` (Relationen → `restaurants`, `webhooks` mit cascadeDelete
   **true**; Index (`webhook`,`created`); create/update/delete **leer** — nur der
   Server schreibt)

> Nach dem Anlegen im Repo-Root **`pnpm typegen`** laufen lassen → `packages/pb/
> src/types.ts` erhält die neuen Typen. Bis dahin nutzt der Daten-Layer die
> Interim-Typen in `packages/pb/src/website.ts` (dort vermerkt).
>
> **Go-Hooks (automatisch aktiv, sobald die Collections existieren):**
> `internal/website` (a) setzt `restaurant` beim Create autoritativ, pinnt es beim
> Update und prüft `routes.page`/`products.category` auf Tenant-Gleichheit; (b)
> **provisioniert** bei jedem neuen `restaurants`-Record automatisch die 1:1-Zeilen
> `site_settings` (`defaultLang=de`, `locales=["de"]`) und `restaurant_billing`
> (`plan=free`, `billingStatus=trialing`); (c) feuert bei publish-relevanten
> Änderungen (inkl. `site_settings`) den Revalidate-Hook an `apps/web`.
>
> **Bestandsrestaurants** (vor diesem Hook angelegt) brauchen die `site_settings`/
> `restaurant_billing`-Zeile **einmalig nachträglich** (Superuser im Admin oder API).

### Backfill bei Bestandsdaten (nur, wenn schon Daten existieren)

Wird die Pflicht-Relation `restaurant` **nachträglich** auf Collections mit
Bestandsdaten gelegt, gilt zwingend die Reihenfolge **optional → backfill →
required** — sonst werden alle Altdatensätze ungültig:

1. Default-`restaurant` anlegen.
2. `restaurant` auf `users`/`shifts`/`tables`/`table_groups`/`reservations`
   zunächst als **optionale** Relation anlegen.
3. **Backfill:** alle Bestandsdatensätze dem Default-Restaurant zuordnen.
4. Erst dann die `restaurant`-Felder auf **required** umstellen.
5. Vor dem Tenant-Scopen der `users`-Regeln sicherstellen, dass der eigene
   Login-User ein `restaurant` **und** passende `permissions` hat — sonst sperrt
   man sich aus der App aus (der Superuser kommt im Admin weiterhin rein).
