/** Paths that can sit on Ready Writer One without using /api/account or /account. */

export const WRITING_ACCOUNT_PAGES = {
  home: '/humanuscript/account',
  signIn: '/humanuscript/account/sign-in',
  signUp: '/humanuscript/account/sign-up',
  manage: '/humanuscript/account/manage',
};

export const WRITING_ACCOUNT_API = {
  signup: '/api/writing-accounts/signup',
  login: '/api/writing-accounts/login',
  logout: '/api/writing-accounts/logout',
  me: '/api/writing-accounts/me',
  profile: '/api/writing-accounts/profile',
  password: '/api/writing-accounts/password',
  tools: '/api/writing-accounts/tools',
};

export function writingSyncPath(tool) {
  return `/api/writing-accounts/sync/${tool}`;
}
