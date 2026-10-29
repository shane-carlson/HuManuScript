/**
 * Ready Writer One account sync.
 *
 * Manuscripts, notes, and certification are sent only to this origin.
 * They are not sent to an AI, and this module does not recompute seal hashes.
 *
 * Sign-in page: https://www.readywriter.one/account
 * Auth: Authorization: Bearer <token>
 *
 * - POST   /api/account/signup   { email, password, displayName } — confirm email, then log in
 * - POST   /api/account/login    { email, password } → { token, tokenType: "Bearer", user }
 * - POST   /api/account/logout
 * - GET    /api/account/me
 * - GET    /api/humanuscript/sync   snapshot is null until the first push
 * - PUT    /api/humanuscript/sync   replace. Body limit 4,400,000 bytes.
 *     { "version": 1, "manuscripts": {}, "notes": {}, "certification": {} }
 *     Later pushes send If-Match: "<revision>". A mismatch is 409 and includes the current snapshot.
 * - DELETE /api/humanuscript/sync   not used on sign-out; signing out keeps the account copy
 */

/** Single base URL for sign-in and snapshot push/pull. */
export const READYWRITER_SYNC_BASE_URL = 'https://www.readywriter.one';

export const READYWRITER_ACCOUNT_PAGE = 'https://www.readywriter.one/account';

export const READYWRITER_SYNC_PATHS = {
  signup: '/api/account/signup',
  login: '/api/account/login',
  logout: '/api/account/logout',
  me: '/api/account/me',
  snapshot: '/api/humanuscript/sync',
} as const;

export function readywriterSyncUrl(path: (typeof READYWRITER_SYNC_PATHS)[keyof typeof READYWRITER_SYNC_PATHS]): string {
  const base = new URL(READYWRITER_SYNC_BASE_URL);
  const url = new URL(path, base);
  if (url.origin !== base.origin) {
    throw new Error('Manuscripts are only sent to readywriter.one.');
  }
  return url.toString();
}

export function assertReadywriterSyncUrl(value: string): void {
  const base = new URL(READYWRITER_SYNC_BASE_URL);
  const url = new URL(value);
  if (url.origin !== base.origin) {
    throw new Error('Manuscripts are only sent to readywriter.one.');
  }
  const allowed = new Set<string>(Object.values(READYWRITER_SYNC_PATHS));
  if (!allowed.has(url.pathname)) {
    throw new Error('That readywriter.one path is not a sync path.');
  }
}
