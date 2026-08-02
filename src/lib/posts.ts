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
