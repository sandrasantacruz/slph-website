/**
 * Normalisierung für die Suche: Kleinschreibung und Akzente weg, damit
 * „oceanos" auch „Océanos" findet. Wird beim Build für den Index und im
 * Browser für die Eingabe benutzt — beide Seiten müssen identisch normalisieren.
 */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
