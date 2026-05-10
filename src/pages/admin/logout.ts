import type { APIRoute } from 'astro';
import { clearAuthCookie } from '../../lib/pb';

export const POST: APIRoute = () =>
  new Response(null, {
    status: 303,
    headers: {
      location: '/admin/login',
      'set-cookie': clearAuthCookie(),
    },
  });

export const GET: APIRoute = ({ redirect }) => redirect('/admin/login');
