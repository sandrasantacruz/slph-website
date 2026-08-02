export interface Settings {
  whatsapp: string;
  phone: string;
  email: string;
}

/**
 * Kontaktdaten der Seite. Lagen bis zum Frontend-Umbau in der
 * `settings`-Collection des alten PocketBase und wurden pro Request gelesen.
 * Ohne Backend gibt es keine Laufzeitquelle mehr, deshalb stehen sie hier —
 * eine Änderung ist ein Commit, kein Formular.
 *
 * Wenn sie wieder aus dem CMS kommen sollen: paula hat dafür
 * `site_settings.contactEmail` / `contactPhone` / `contacts` (SCHEMA.md §5).
 * Für diesen Tenant sind die Felder aktuell leer.
 */
export const SETTINGS: Settings = {
  whatsapp: '651 80 37 99',
  phone: '651 80 37 99',
  email: 'info@silospeceshablaran.com',
};

// Liefert immer eine internationale tel:-URL mit +34, sofern kein anderer Prefix
// schon gesetzt ist. Trennzeichen werden entfernt.
export function telHref(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) return '';
  const startedWithPlus = cleaned.startsWith('+');
  const digits = cleaned.replace(/[^\d]/g, '');
  if (!digits) return '';
  return `tel:${startedWithPlus ? `+${digits}` : `+34${digits}`}`;
}

// wa.me akzeptiert nur Ziffern (kein +). 9-stellige Nummern werden als Spanien angenommen.
export function whatsappHref(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) return '';
  let digits = cleaned.replace(/[^\d]/g, '');
  const startedWithPlus = cleaned.startsWith('+');
  if (!startedWithPlus && digits.length === 9) {
    digits = `34${digits}`;
  }
  return `https://wa.me/${digits}`;
}

export function mailHref(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) return '';
  return `mailto:${cleaned}`;
}
