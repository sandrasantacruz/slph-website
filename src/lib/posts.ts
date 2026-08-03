import type { CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/**
 * Die URL der Seite bildet den `postKey` ab, nicht `data.path` aus dem CMS.
 * Grund: `postKey` hat im Ziel einen Unique-Index und entspricht genau den
 * Slugs, unter denen die Artikel heute schon erreichbar sind. Ein im Back
 * Office umbenannter Route-Slug ändert damit keine bestehende URL. `data.path`
 * bleibt trotzdem verfügbar, falls später Weiterleitungen nötig werden.
 */
export function postPath(post: Post): string {
  return `/noticias/${post.id}`;
}

/** Termin bei Veranstaltungen, sonst das Veröffentlichungsdatum. */
export function postDate(post: Post): Date | undefined {
  return post.data.kind === 'event' ? post.data.startsAt : post.data.publishedAt;
}

/** Neueste zuerst; Beiträge ohne Datum ans Ende. */
export function byDateDesc(a: Post, b: Post): number {
  return (postDate(b)?.getTime() ?? 0) - (postDate(a)?.getTime() ?? 0);
}

/** Eine Veranstaltung ist vorbei, wenn ihr Ende (sonst ihr Beginn) zurückliegt. */
export function isPastEvent(post: Post, now: Date = new Date()): boolean {
  if (post.data.kind !== 'event') return false;
  const end = post.data.endsAt ?? post.data.startsAt;
  return end ? end < now : false;
}

/** Seitenverhältnis der Cover in Liste und Detail-Kopf. */
const COVER_RATIO = 3 / 2;

export interface CoverBox {
  width: number;
  height: number;
  /** srcset-Breiten, die die Box nicht überschreiten. */
  widths: number[];
  /** Zuschnitt-Anker für sharp, abgeleitet aus dem Fokuspunkt. */
  position: string;
}

/**
 * Fokuspunkt (0..1) auf einen der neun Anker abbilden, die sharp beim
 * Zuschneiden kennt. Feiner geht es nicht: `fit: cover` nimmt Himmelsrichtungen
 * oder `centre`, keine Bruchteile. Für die Praxis reicht das, weil der
 * Unterschied zwischen „rechts" und „bei 0,7" bei einem 3:2-Schnitt meist
 * wenige Prozent der Bildbreite ausmacht.
 */
function anchor(focalX?: number, focalY?: number): string {
  if (focalX === undefined && focalY === undefined) return 'center';
  const third = (v: number, low: string, mid: string, high: string) =>
    v < 1 / 3 ? low : v > 2 / 3 ? high : mid;
  const x = third(focalX ?? 0.5, 'left', '', 'right');
  const y = third(focalY ?? 0.5, 'top', '', 'bottom');
  if (!x && !y) return 'center';
  // sharp erwartet „right top", nicht „top right".
  return [x, y].filter(Boolean).join(' ');
}

/**
 * Größte 3:2-Fläche, die in die Quelle passt, höchstens `maxWidth` breit.
 *
 * Nötig, weil Astros Bild-Service `withoutEnlargement: true` setzt: eine
 * Zielbox, die in einer Dimension über der Quelle liegt, wird nicht
 * zugeschnitten, sondern die Quelle unverändert durchgereicht. Die Cover im
 * CMS sind bei weitem nicht alle 3:2, ein fester Wert würde also je nach
 * Bild greifen oder eben nicht.
 *
 * Die Breite wird auf ein Vielfaches von 3 abgerundet, damit die Höhe ohne
 * Rundungsrest aufgeht.
 */
export function coverBox(
  cover: { width?: number; height?: number; focalX?: number; focalY?: number },
  maxWidth: number,
  steps: number[] = [],
): CoverBox {
  const sw = cover.width ?? maxWidth;
  const sh = cover.height ?? Math.round(maxWidth / COVER_RATIO);

  // Quelle breiter als 3:2 → die Höhe bleibt, seitlich wird beschnitten.
  const fitted = sw / sh > COVER_RATIO ? Math.round(sh * COVER_RATIO) : sw;
  const width = Math.max(3, Math.min(fitted, maxWidth) - (Math.min(fitted, maxWidth) % 3));

  return {
    width,
    height: (width / 3) * 2,
    widths: [...steps.filter((w) => w < width), width],
    position: anchor(cover.focalX, cover.focalY),
  };
}
