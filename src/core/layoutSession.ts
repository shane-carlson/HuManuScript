/**
 * Rails, menus, and pane grab bars. Stored in localStorage under
 * humanuscript.sessionLayout so a later launch, including after an update,
 * restores the last choice. Electron keeps that store in the app user-data
 * directory. Window bounds stay in window-bounds.json.
 */

export const LAYOUT_SESSION_KEY = 'humanuscript.sessionLayout';

export type LayoutSession = {
  sidebarCollapsed: boolean;
  notesCollapsed: boolean;
  certificationCollapsed: boolean;
  railCollapsed: boolean;
  sidebarWidth: number;
  notesWidth: number;
  certificationWidth: number;
};

export const DEFAULT_LAYOUT_SESSION: LayoutSession = {
  sidebarCollapsed: false,
  notesCollapsed: false,
  certificationCollapsed: false,
  railCollapsed: false,
  sidebarWidth: 260,
  notesWidth: 240,
  certificationWidth: 260,
};

export const LAYOUT_PANE_LIMITS = {
  sidebarWidth: { min: 180, max: 480 },
  notesWidth: { min: 180, max: 520 },
  certificationWidth: { min: 200, max: 560 },
} as const;

export type LayoutPaneKey = keyof typeof LAYOUT_PANE_LIMITS;

export type LayoutSessionFlags = {
  sidebarCollapsed?: boolean;
  notesCollapsed?: boolean;
  certificationCollapsed?: boolean;
};

export function clampPaneWidth(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Largest width the dragged pane can take without covering the manuscript. */
export function paneRoom(
  layoutWidth: number,
  siblingWidth: number,
  limits: { min: number; max: number },
  manuscriptMin = 360,
  gaps = 24,
): number {
  if (!Number.isFinite(layoutWidth)) return limits.max;
  const room = Math.floor(layoutWidth - siblingWidth - gaps - manuscriptMin);
  return Math.max(limits.min, Math.min(limits.max, room));
}

function storedBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function storedWidth(value: unknown, key: LayoutPaneKey): number {
  const limits = LAYOUT_PANE_LIMITS[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LAYOUT_SESSION[key];
  return clampPaneWidth(value, limits.min, limits.max);
}

/**
 * A saved boolean or width wins. A missing field uses the previous session
 * flag when one was passed, then the default. An out-of-range width is
 * clamped to the pane limits and is not replaced with the default.
 */
export function layoutSessionFromStored(
  raw: string | null | undefined,
  session?: LayoutSessionFlags,
): LayoutSession {
  let parsed: unknown = null;
  if (typeof raw === 'string' && raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const flag = (key: keyof LayoutSessionFlags): boolean => {
    if (typeof record[key] === 'boolean') return record[key] as boolean;
    if (session && typeof session[key] === 'boolean') return session[key] as boolean;
    return DEFAULT_LAYOUT_SESSION[key];
  };
  return {
    sidebarCollapsed: flag('sidebarCollapsed'),
    notesCollapsed: flag('notesCollapsed'),
    certificationCollapsed: flag('certificationCollapsed'),
    railCollapsed: storedBoolean(record.railCollapsed, DEFAULT_LAYOUT_SESSION.railCollapsed),
    sidebarWidth: storedWidth(record.sidebarWidth, 'sidebarWidth'),
    notesWidth: storedWidth(record.notesWidth, 'notesWidth'),
    certificationWidth: storedWidth(record.certificationWidth, 'certificationWidth'),
  };
}
