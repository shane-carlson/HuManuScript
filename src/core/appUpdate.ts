/** Copy for the GitHub Release prompt. The feed itself stays in electron-updater. */

import type { AvailableUpdate, UpdateFeedPhase } from './deviceName.ts';

const RELEASE_VERSION = /^[0-9]+(?:\.[0-9A-Za-z]+){1,3}$/;

export type UpdatePromptPhase =
  | 'available'
  | 'confirm'
  | 'downloading'
  | 'downloaded'
  | 'failed'
  | 'checking'
  | 'current'
  | 'check-failed';

export type UpdatePromptModel = {
  phase: UpdatePromptPhase;
  message: string;
  detail: string;
  percent: number | null;
  primary: string | null;
  secondary: string | null;
};

function releaseName(version: string): string {
  const trimmed = version.trim();
  return RELEASE_VERSION.test(trimmed) ? trimmed : '';
}

function percentOf(value: number | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Line shown when electron-updater finds a newer GitHub Release. */
export function updateAvailableMessage(version: string): string {
  return updatePromptModel({ phase: 'available', version })?.message ?? 'An update is available.';
}

const localListeners = new Set<(update: AvailableUpdate) => void>();

/** Result of a check that never reached the desktop updater, such as the browser. */
export function publishLocalUpdate(update: AvailableUpdate): void {
  for (const listener of localListeners) listener(update);
}

export function subscribeLocalUpdate(listener: (update: AvailableUpdate) => void): () => void {
  localListeners.add(listener);
  return () => {
    localListeners.delete(listener);
  };
}

/**
 * Banner for one step of the update. Confirming is local: the download has
 * not started, and a restart has not been asked for, until the matching button.
 */
export function updatePromptModel(input: {
  phase: UpdateFeedPhase;
  version: string;
  percent?: number;
  confirming?: boolean;
}): UpdatePromptModel | null {
  const version = releaseName(input.version);
  const phase = input.phase;
  if (phase === 'checking') {
    return {
      phase: 'checking',
      message: 'Checking for updates…',
      detail: 'You can keep writing.',
      percent: null,
      primary: null,
      secondary: null,
    };
  }
  if (phase === 'current') {
    return {
      phase: 'current',
      message: 'HuManuScript is up to date.',
      detail: 'You can keep writing.',
      percent: null,
      primary: null,
      secondary: 'Dismiss',
    };
  }
  if (phase === 'check-failed') {
    return {
      phase: 'check-failed',
      message: 'Could not check for updates.',
      detail: 'You can keep writing.',
      percent: null,
      primary: null,
      secondary: 'Dismiss',
    };
  }
  if (phase !== 'available' && phase !== 'downloading' && phase !== 'downloaded' && phase !== 'failed') return null;

  if ((phase === 'available' || phase === 'failed') && input.confirming) {
    return {
      phase: 'confirm',
      message: version ? `Download update ${version}?` : 'Download the update?',
      detail: 'The download runs while you write. HuManuScript restarts only after you confirm.',
      percent: null,
      primary: 'Download',
      secondary: 'Not now',
    };
  }

  if (phase === 'downloading') {
    const percent = percentOf(input.percent);
    return {
      phase: 'downloading',
      message: version ? `Downloading update ${version}… ${percent}%` : `Downloading the update… ${percent}%`,
      detail: 'You can keep writing.',
      percent,
      primary: null,
      secondary: null,
    };
  }

  if (phase === 'downloaded') {
    return {
      phase: 'downloaded',
      message: version ? `Restart to apply update ${version}.` : 'Restart to apply the update.',
      detail: 'The download is finished. HuManuScript will not restart until you confirm.',
      percent: null,
      primary: 'Restart',
      secondary: null,
    };
  }

  if (phase === 'failed') {
    return {
      phase: 'failed',
      message: 'The update could not be downloaded.',
      detail: 'You can keep writing and try again.',
      percent: null,
      primary: 'Try again',
      secondary: null,
    };
  }

  return {
    phase: 'available',
    message: version ? `Update ${version} is available.` : 'An update is available.',
    detail: 'Download it when you are ready. You can keep writing.',
    percent: null,
    primary: 'Update',
    secondary: null,
  };
}
