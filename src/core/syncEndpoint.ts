/**
 * HuManuScript account service.
 *
 * Manuscripts, notes, and certification are sent only to this origin, and only
 * after sign-in. They are not sent to an AI, and this module does not recompute
 * seal hashes. The account is not a Ready Writer One account. SpeakFiction and
 * later writing tools can use the same sign-in. Only HuManuScript syncs here.
 *
 * Override the host with VITE_ACCOUNT_BASE_URL. The local service is `npm run account`.
 *
 * - POST   /api/account/signup   { email, password, displayName, tool }
 * - POST   /api/account/login    { email, password, tool } → { token, tokenType, user }
 * - POST   /api/account/logout
 * - GET    /api/account/me
 * - PATCH  /api/account/profile  { displayName }
 * - POST   /api/account/password { currentPassword, password }
 * - GET    /api/account/tools
 * - POST   /api/account/tools    { tool }
 * - GET    /api/sync/humanuscript
 * - PUT    /api/sync/humanuscript   replace. Later pushes send If-Match.
 */

import { THIS_WRITING_TOOL, WRITING_TOOLS, type WritingToolId } from './accountTools.ts';

export const ACCOUNT_SERVICE_PORT = 8787;

function configuredAccountBaseUrl(): string {
  const raw = import.meta.env?.VITE_ACCOUNT_BASE_URL;
  if (typeof raw === 'string' && raw.trim()) return raw.trim().replace(/\/$/, '');
  return `http://127.0.0.1:${ACCOUNT_SERVICE_PORT}`;
}

/** Single base URL for sign-in and snapshot push/pull. */
export const ACCOUNT_BASE_URL = configuredAccountBaseUrl();

export const ACCOUNT_PATHS = {
  signup: '/api/account/signup',
  login: '/api/account/login',
  logout: '/api/account/logout',
  me: '/api/account/me',
  profile: '/api/account/profile',
  password: '/api/account/password',
  tools: '/api/account/tools',
  snapshot: `/api/sync/${THIS_WRITING_TOOL}`,
} as const;

export function accountSnapshotPath(tool: WritingToolId = THIS_WRITING_TOOL): string {
  return `/api/sync/${tool}`;
}

export function accountUrl(path: string): string {
  const base = new URL(ACCOUNT_BASE_URL);
  const url = new URL(path, base);
  if (url.origin !== base.origin) {
    throw new Error('Manuscripts are only sent to the account service.');
  }
  return url.toString();
}

export function assertAccountUrl(value: string): void {
  const base = new URL(ACCOUNT_BASE_URL);
  const url = new URL(value);
  if (url.origin !== base.origin) {
    throw new Error('Manuscripts are only sent to the account service.');
  }
  const allowed = new Set<string>([
    ...Object.values(ACCOUNT_PATHS),
    ...WRITING_TOOLS.map((tool) => accountSnapshotPath(tool.id)),
  ]);
  if (!allowed.has(url.pathname)) {
    throw new Error('That path is not an account path.');
  }
}
