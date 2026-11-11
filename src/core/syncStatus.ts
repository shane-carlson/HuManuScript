/** Plain-language sync states. Signing in is only required to sync. */

export type SyncPhase = 'signed-out' | 'signed-in' | 'syncing' | 'success' | 'failure';

export const SYNC_COPY = {
  signedOut:
    'Your books stay on this computer. Sign in with your HuManuScript account only when you want this install to share them. You can create that account here. SpeakFiction and other writing tools can use the same sign-in later.',
  notSentToAi: 'Books, notes, and certification go only to that account. They are not sent to an AI.',
  syncing: 'Copying books, notes, and certification to your HuManuScript account.',
  success: 'This install and your account now have the same books, notes, and certification.',
  failureKept: 'Your books are still on this computer.',
  createTitle: 'Create a HuManuScript account',
  signInTitle: 'Sign in to HuManuScript',
  signInHelp: 'Use the email and password for your HuManuScript account.',
  passwordHint: 'At least 12 characters, with uppercase, lowercase, a number, and a symbol.',
  confirmThenSignIn: 'Confirm your email, then sign in.',
} as const;

export function formatSyncTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'an unknown time';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function syncStatusLine(args: { phase: SyncPhase; email: string | null; lastSyncAt: string | null }): string {
  if (args.phase === 'syncing') return 'Syncing…';
  if (args.phase === 'failure') {
    return args.email ? `Signed in as ${args.email}. Sync did not finish.` : 'Sync did not finish';
  }
  if (!args.email) return 'Not signed in';
  if (!args.lastSyncAt) return `Signed in as ${args.email}. Not synced yet.`;
  return `Signed in as ${args.email}. Last sync ${formatSyncTime(args.lastSyncAt)}.`;
}
