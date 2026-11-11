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
 * These paths are separate from Ready Writer One's /api/account routes and from
 * /api/humanuscript/sync. The unlisted site pages live under /humanuscript/account.
 *
 * - POST   /api/writing-accounts/signup   { email, password, displayName, tool }
 * - POST   /api/writing-accounts/login    { email, password, tool } → { token, tokenType, user }
 * - POST   /api/writing-accounts/logout
 * - GET    /api/writing-accounts/me
 * - PATCH  /api/writing-accounts/profile  { displayName }
 * - POST   /api/writing-accounts/password { currentPassword, password }
 * - GET    /api/writing-accounts/tools
 * - POST   /api/writing-accounts/tools    { tool }
 * - GET    /api/writing-accounts/sync/humanuscript
 * - PUT    /api/writing-accounts/sync/humanuscript   replace. Later pushes send If-Match.
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
  signup: '/api/writing-accounts/signup',
  login: '/api/writing-accounts/login',
  logout: '/api/writing-accounts/logout',
  me: '/api/writing-accounts/me',
  profile: '/api/writing-accounts/profile',
  password: '/api/writing-accounts/password',
  tools: '/api/writing-accounts/tools',
  snapshot: `/api/writing-accounts/sync/${THIS_WRITING_TOOL}`,
} as const;

export const ACCOUNT_PAGE_PATHS = {
  home: '/humanuscript/account',
  signIn: '/humanuscript/account/sign-in',
  signUp: '/humanuscript/account/sign-up',
  manage: '/humanuscript/account/manage',
} as const;

export function accountSnapshotPath(tool: WritingToolId = THIS_WRITING_TOOL): string {
  return `/api/writing-accounts/sync/${tool}`;
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
