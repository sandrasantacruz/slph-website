import { defineMiddleware } from 'astro:middleware';
import { pbFromCookie } from './lib/pb';

export const onRequest = defineMiddleware(async (context, next) => {
  const cookie = context.request.headers.get('cookie');
  const pb = pbFromCookie(cookie);
  context.locals.pb = pb;
  context.locals.user = pb.authStore.isValid ? (pb.authStore.record ?? null) : null;

  const { pathname } = context.url;
  const needsAuth = pathname.startsWith('/admin') && pathname !== '/admin/login';
  if (needsAuth && !context.locals.user) {
    const target = encodeURIComponent(pathname + context.url.search);
    return context.redirect(`/admin/login?next=${target}`);
  }

  return next();
});
