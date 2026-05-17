# SEO-TODOs (manuell durch dich)

Alles im Code ist erledigt. Diese Schritte muss ein Mensch über die jeweiligen Web-Konsolen anstoßen. Reihenfolge: erst Search Console (Punkt 1), dann der Rest.

Detailhintergrund zu jedem Punkt steht in [`seo-search-console.md`](./seo-search-console.md).

## 1. Google Search Console einrichten

- [ ] [search.google.com/search-console](https://search.google.com/search-console) öffnen
- [ ] „Property hinzufügen" → Typ **Domain** wählen
- [ ] `silospeceshablaran.com` eintragen
- [ ] Den angezeigten **TXT-Record** im DNS-Provider als TXT auf `@` (Root) einfügen
- [ ] Auf „Verifizieren" klicken (kann ein paar Minuten dauern, bis DNS propagiert)
- [ ] Nach erfolgreicher Verifizierung links **Sitemaps** öffnen
- [ ] `sitemap.xml` eintragen und absenden → Status sollte auf „Erfolgreich" wechseln

## 2. Veraltetes „Noticias"-Sitelink loswerden

- [ ] In der Search Console oben in die Suchleiste die alte URL eingeben (z.B. `https://silospeceshablaran.com/noticias`)
- [ ] **URL-Inspektion** → „Indexierung beantragen" (forciert einen Recrawl)
- [ ] Falls die URL noch tatsächlich existiert und 404 liefert: unter **Entfernen → Vorübergehende Entfernungen** zusätzlich eine Sperre setzen
- [ ] Das Sitelink ersetzt sich von selbst, sobald Google das neue Schema mehrfach gecrawlt hat (typisch 1–4 Wochen)

## 3. Google Business Profile beanspruchen

Die „Artist in Las Palmas de Gran Canaria"-Karte rechts neben dem Suchergebnis lässt sich nur dort pflegen, nicht über die Website.

- [ ] [business.google.com](https://business.google.com) öffnen
- [ ] Mit dem gewünschten Google-Account einloggen
- [ ] Nach „Si los peces hablaran" suchen
- [ ] Falls vorhanden: „Dieses Unternehmen beanspruchen" anklicken
- [ ] Falls nicht vorhanden: neues Profil anlegen, Kategorie z.B. „Künstler" oder „Verlag/Projekt"
- [ ] Verifizierung durchziehen (per Postkarte, Telefon oder E-Mail je nach Angebot)
- [ ] Nach Freischaltung pflegen: Telefon, Adresse, Öffnungszeiten, Beschreibung, Fotos, Website-URL `silospeceshablaran.com`

## 4. Rich-Results-Test (einmalig nach Deploy)

- [ ] Nach dem nächsten Deploy: [search.google.com/test/rich-results](https://search.google.com/test/rich-results) öffnen
- [ ] `https://silospeceshablaran.com` eingeben → Fehler/Warnungen prüfen
- [ ] Stichprobe: zusätzlich `https://silospeceshablaran.com/comprar` (Book-Schema) und `https://silospeceshablaran.com/autor` (Person-Schema) testen

## 5. Nice-to-have (später, nicht eilig)

- [ ] Soziale Profile aktualisieren: Website-Link in Facebook/Instagram/YouTube-Bio auf `silospeceshablaran.com` setzen, falls noch nicht der Fall (stärkt das `sameAs` aus dem Organization-Schema)
- [ ] Bei größeren Inhaltsänderungen (neue Hauptseiten, FAQ, neue Bücher) den Pflegeabschnitt in [`seo-search-console.md`](./seo-search-console.md#pflege-im-alltag) durchgehen
