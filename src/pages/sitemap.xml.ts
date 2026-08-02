import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

import { postPath } from '../lib/posts';
import { SITE_URL } from '../lib/seo';

// Zur Build-Zeit erzeugt: die Artikel kommen aus der Content-Collection, die
// beim Build aus pulpo geladen wird. Ein neuer Beitrag steht also mit dem
// nächsten Deploy in der Sitemap, nicht in dem Moment, in dem er im Back
// Office erscheint.

interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

const STATIC_URLS: UrlEntry[] = [
  { loc: '/', changefreq: 'weekly', priority: 1.0 },
  { loc: '/programa', changefreq: 'monthly', priority: 0.9 },
  { loc: '/sobre-el-cuento', changefreq: 'monthly', priority: 0.9 },
  { loc: '/lee-un-fragmento', changefreq: 'monthly', priority: 0.8 },
  { loc: '/cuadernillo', changefreq: 'monthly', priority: 0.7 },
  { loc: '/autor', changefreq: 'monthly', priority: 0.8 },
  { loc: '/ilustrador', changefreq: 'monthly', priority: 0.7 },
  { loc: '/repercusion', changefreq: 'monthly', priority: 0.7 },
  { loc: '/galeria', changefreq: 'monthly', priority: 0.7 },
  { loc: '/comprar', changefreq: 'monthly', priority: 0.9 },
  { loc: '/noticias', changefreq: 'weekly', priority: 0.8 },
  { loc: '/colabora', changefreq: 'monthly', priority: 0.7 },
  { loc: '/contacto', changefreq: 'yearly', priority: 0.6 },
  { loc: '/aviso-legal', changefreq: 'yearly', priority: 0.2 },
  { loc: '/politica-de-privacidad', changefreq: 'yearly', priority: 0.2 },
  { loc: '/politica-de-cookies', changefreq: 'yearly', priority: 0.2 },
];

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function urlNode(entry: UrlEntry): string {
  const parts = [`    <loc>${xmlEscape(SITE_URL + entry.loc)}</loc>`];
  if (entry.lastmod) parts.push(`    <lastmod>${entry.lastmod}</lastmod>`);
  if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
  if (typeof entry.priority === 'number') parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
  return `  <url>\n${parts.join('\n')}\n  </url>`;
}

export const GET: APIRoute = async () => {
  const entries: UrlEntry[] = [...STATIC_URLS];

  for (const post of await getCollection('posts')) {
    const lastmod = post.data.updated ?? post.data.publishedAt;
    entries.push({
      loc: postPath(post),
      lastmod: lastmod?.toISOString(),
      changefreq: 'monthly',
      priority: 0.6,
    });
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(urlNode).join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
