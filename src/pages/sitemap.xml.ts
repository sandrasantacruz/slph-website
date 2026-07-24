import type { APIRoute } from 'astro';
import { SITE_URL } from '../lib/seo';

// Dynamische Sitemap. Wir ziehen die Posts zur Request-Zeit aus PocketBase
// (deshalb prerender=false): so spiegelt /sitemap.xml den aktuellen
// publication-Status wider und erfasst neue Novedades ohne Rebuild.
export const prerender = false;

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

export const GET: APIRoute = async ({ locals }) => {
  const entries: UrlEntry[] = [...STATIC_URLS];

  try {
    const posts = await locals.pb.collection('posts').getFullList({
      filter: 'status = "published" && published_at <= @now',
      fields: 'slug,published_at,updated,event_date,event_end',
    });

    for (const p of posts) {
      if (!p.slug) continue;
      const lastmod = p.updated || p.published_at;
      entries.push({
        loc: `/noticias/${p.slug}`,
        lastmod: lastmod ? new Date(lastmod).toISOString() : undefined,
        changefreq: 'monthly',
        priority: 0.6,
      });
    }
  } catch {
    // PB nicht erreichbar — wir liefern trotzdem die statischen URLs aus.
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
