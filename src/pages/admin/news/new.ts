import type { APIRoute } from 'astro';

export const prerender = false;

function draftSlug(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `draft-${rand}`;
}

export const POST: APIRoute = async ({ locals, redirect }) => {
  const record = await locals.pb.collection('news').create({
    title: '',
    slug: draftSlug(),
    status: 'draft',
  });
  return redirect(`/admin/news/${record.id}/edit`);
};

export const GET: APIRoute = ({ redirect }) => redirect('/admin/news');
