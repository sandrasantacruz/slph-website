import type { APIRoute } from 'astro';

export const prerender = false;

function draftSlug(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `draft-${rand}`;
}

export const POST: APIRoute = async ({ locals, redirect }) => {
  // Default-Typ ist 'news' — der einfachere Fall ohne Pflicht-Datum.
  // Im Editor lässt sich der Typ jederzeit umschalten.
  const record = await locals.pb.collection('posts').create({
    title: '',
    slug: draftSlug(),
    status: 'draft',
    typ: 'news',
  });
  return redirect(`/admin/novedades/${record.id}/edit`);
};

export const GET: APIRoute = ({ redirect }) => redirect('/admin/novedades');
