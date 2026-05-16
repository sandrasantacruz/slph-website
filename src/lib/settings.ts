import type PocketBase from 'pocketbase';

export interface Settings {
  whatsapp: string;
  phone: string;
  email: string;
}

const EMPTY: Settings = { whatsapp: '', phone: '', email: '' };

// Singleton-Record: per Migration angelegt, daher gibt es genau einen.
// Falls die Collection (noch) leer ist — z.B. unmittelbar nach Deploy ohne
// Migration —, fallen wir auf leere Werte zurück, damit die öffentliche
// Seite nicht crasht.
export async function getSettings(pb: PocketBase): Promise<Settings> {
  try {
    const rec = await pb.collection('settings').getFirstListItem('');
    return {
      whatsapp: typeof rec.whatsapp === 'string' ? rec.whatsapp : '',
      phone: typeof rec.phone === 'string' ? rec.phone : '',
      email: typeof rec.email === 'string' ? rec.email : '',
    };
  } catch {
    return EMPTY;
  }
}

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
