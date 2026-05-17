import { defineMiddleware } from 'astro:middleware';
import { pbFromCookie } from './lib/pb';

export const onRequest = defineMiddleware(async (context, next) => {

  if (context.isPrerendered) {
    return next();
  }

  const { pathname } = context.url;

  const cookie = context.request.headers.get('cookie');
  const pb = pbFromCookie(cookie);
  context.locals.pb = pb;
  context.locals.user = pb.authStore.isValid ? (pb.authStore.record ?? null) : null;

  const needsAuth = pathname.startsWith('/admin') && pathname !== '/admin/login';
  if (needsAuth && !context.locals.user) {
    const target = encodeURIComponent(pathname + context.url.search);
    return context.redirect(`/admin/login?next=${target}`);
  }

  const response = await next();
  if (pathname.startsWith('/admin')) {
    response.headers.set('Cache-Control', 'no-store');
  }
  return response;
});
