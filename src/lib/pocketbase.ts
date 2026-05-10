import PocketBase from 'pocketbase';
import { AUTH_COOKIE, PB_URL } from './pb';

export const pb = new PocketBase(PB_URL);

if (typeof document !== 'undefined') {
  pb.authStore.loadFromCookie(document.cookie, AUTH_COOKIE);
  pb.authStore.onChange(() => {
    document.cookie = pb.authStore.exportToCookie(
      {
        httpOnly: false,
        secure: location.protocol === 'https:',
        sameSite: 'Lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      },
      AUTH_COOKIE,
    );
  }, true);
}

export type { RecordModel, ListResult } from 'pocketbase';
