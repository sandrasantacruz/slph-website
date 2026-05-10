import type { APIRoute } from 'astro';

function draftSlug(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `draft-${rand}`;
}

export const POST: APIRoute = async ({ locals, redirect }) => {
  const record = await locals.pb.collection('posts').create({
    title: '',
    slug: draftSlug(),
    status: 'draft',
  });
  return redirect(`/admin/posts/${record.id}/edit`);
};

export const GET: APIRoute = ({ redirect }) => redirect('/admin/posts');
