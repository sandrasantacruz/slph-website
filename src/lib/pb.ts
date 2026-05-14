import PocketBase from 'pocketbase';

const PB_URL = import.meta.env.PUBLIC_POCKETBASE_URL ?? 'http://127.0.0.1:8090';

const PB_PUBLIC_URL =
  (typeof process !== 'undefined' ? process.env.PB_APP_URL : undefined) ||
  PB_URL;

export const AUTH_COOKIE = 'pb_auth';

export function createPb(): PocketBase {
  return new PocketBase(PB_URL);
}

export function pbFromCookie(cookieHeader: string | null | undefined): PocketBase {
  const pb = createPb();
  if (cookieHeader) {
    pb.authStore.loadFromCookie(cookieHeader, AUTH_COOKIE);
  }
  return pb;
}

export function authCookie(pb: PocketBase): string {
  return pb.authStore.exportToCookie(
    {
      httpOnly: false,
      secure: import.meta.env.PROD,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    },
    AUTH_COOKIE,
  );
}

export function clearAuthCookie(): string {
  const pb = createPb();
  pb.authStore.clear();
  return pb.authStore.exportToCookie(
    {
      httpOnly: false,
      secure: import.meta.env.PROD,
      sameSite: 'Lax',
      path: '/',
      maxAge: 0,
    },
    AUTH_COOKIE,
  );
}

export { PB_URL, PB_PUBLIC_URL };
