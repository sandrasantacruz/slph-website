import { defineCollection } from 'astro:content';
// `z` aus `astro:content` ist in Astro 6 deprecated (fliegt in 7 raus).
import { z } from 'astro/zod';

import { paulaPosts } from './lib/paula-loader';

/**
 * Artikel UND Veranstaltungen in einer Collection — im Ziel sind sie eine
 * Tabelle, `kind` unterscheidet sie. Die Trennung passiert beim Abfragen:
 *
 *   const all = await getCollection('posts');
 *   const articulos = all.filter((p) => p.data.kind === 'article');
 *   const proximos  = all.filter((p) => p.data.kind === 'event'
 *     && (p.data.endsAt ?? p.data.startsAt)! >= new Date());
 *
 * Der Body kommt als fertiges, serverseitig gesäubertes HTML aus paula und
 * steht deshalb nicht in den Daten, sondern unter `rendered`:
 *
 *   const { Content } = await render(entry);
 */
const posts = defineCollection({
  loader: paulaPosts(),
  schema: z.object({
    title: z.string(),
    teaser: z.string().optional(),
    kind: z.enum(['article', 'event']),
    /** Letztes Segment der Route, passt zu `/noticias/[slug]`. */
    slug: z.string(),
    /** Vollständiger Pfad im Ziel, z.B. `/noticias/desplastificate`. */
    path: z.string(),
    publishedAt: z.coerce.date().optional(),
    /** Nur bei `kind: 'event'` belegt. */
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    location: z.string().optional(),
    /** Geprüfte Google-Maps-Embed-URL, direkt als iframe-`src` verwendbar. */
    mapEmbed: z.string().optional(),
    cover: z
      .object({
        src: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
        alt: z.string().optional(),
      })
      .optional(),
    tags: z.array(z.string()).default([]),
    author: z.string().optional(),
    updated: z.coerce.date().optional(),
  }),
});

export const collections = { posts };
