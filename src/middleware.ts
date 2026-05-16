import { defineMiddleware } from 'astro:middleware';
import { pbFromCookie } from './lib/pb';

const ANALYTICS_PREFIX = '/analytics';
const ANALYTICS_UPSTREAM = 'https://analytics.pulpo.cloud';

// Headers to forward upstream. Cookies and host are intentionally dropped so
// that the analytics provider sees nothing about the rest of our app.
const FORWARDED_HEADERS = new Set([
  'user-agent',
  'accept',
  'accept-language',
  'accept-encoding',
  'content-type',
  'referer',
]);

async function proxyAnalytics(request: Request, url: URL, clientIp: string | undefined) {
  const upstreamPath = url.pathname.slice(ANALYTICS_PREFIX.length) || '/';
  const upstreamUrl = `${ANALYTICS_UPSTREAM}${upstreamPath}${url.search}`;

  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (FORWARDED_HEADERS.has(name)) headers.set(name, value);
  }
  const xff = request.headers.get('x-forwarded-for');
  const finalXff = clientIp ? (xff ? `${xff}, ${clientIp}` : clientIp) : xff;
  if (finalXff) headers.set('x-forwarded-for', finalXff);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'follow',
  });

  // Drop set-cookie so upstream cookies cannot reach our visitors.
  const out = new Headers(upstream.headers);
  out.delete('set-cookie');
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const onRequest = defineMiddleware(async (context, next) => {

  if (context.isPrerendered) {
    return next();
  }

  const { pathname } = context.url;

  if (pathname === ANALYTICS_PREFIX || pathname.startsWith(`${ANALYTICS_PREFIX}/`)) {
    let clientIp: string | undefined;
    try {
      clientIp = context.clientAddress;
    } catch {
      // clientAddress can throw under SSR adapters that don't expose it.
    }
    return proxyAnalytics(context.request, context.url, clientIp);
  }

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
