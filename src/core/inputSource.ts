/**
 * Input device and keystroke pace stored on a certification seal.
 * Neither fact is part of the SHA-256 content hash.
 */

export const INPUT_SOURCE_UNKNOWN = 'Input source unknown';
export const TYPING_RATE_UNKNOWN = 'Typing rate unknown';
/** A name that arrives just after the first keystroke can still be written on that seal. */
export const INPUT_SOURCE_BACKFILL_MS = 60_000;

export interface InputDeviceNames {
  keyboard: string | null;
  microphone: string | null;
}

export interface InputSource {
  kind: 'keyboard' | 'microphone';
  /** Null when the OS could not name the device. The span is still sealed. */
  name: string | null;
}

/** Timed keystrokes observed for one typed span. Two events are required before a rate exists. */
export interface KeyboardPace {
  keystrokes: number;
  firstAt: string;
  lastAt: string;
}

export interface KeystrokeEvent {
  at: string;
  inputType: string;
  data: string | null;
}

const EMPTY_DEVICES: InputDeviceNames = { keyboard: null, microphone: null };
const CACHE_MS = 15_000;
const LOOKUP_MS = 400;

let cache: { at: number; value: InputDeviceNames } | null = null;
let pending: Promise<InputDeviceNames> | null = null;

type DeviceBridge = {
  getInputDevices?: () => Promise<unknown> | unknown;
};

function pageWindow(): { humanuscript?: DeviceBridge } | undefined {
  return (globalThis as { window?: { humanuscript?: DeviceBridge } }).window;
}

function stripControls(value: string): string {
  let out = '';
  for (const char of value) {
    if (char.charCodeAt(0) >= 32) out += char;
  }
  return out;
}

export function cleanInputDeviceName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = stripControls(value).replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > 160) return null;
  if (cleaned === INPUT_SOURCE_UNKNOWN || cleaned === TYPING_RATE_UNKNOWN) return null;
  return cleaned;
}

function sanitizeDevices(value: unknown): InputDeviceNames {
  const record = value && typeof value === 'object' ? (value as { keyboard?: unknown; microphone?: unknown }) : {};
  return {
    keyboard: cleanInputDeviceName(record.keyboard),
    microphone: cleanInputDeviceName(record.microphone),
  };
}

async function loadInputDeviceNames(): Promise<InputDeviceNames> {
  try {
    const bridge = pageWindow()?.humanuscript?.getInputDevices;
    if (typeof bridge !== 'function') return EMPTY_DEVICES;
    return sanitizeDevices(await Promise.resolve(bridge()));
  } catch {
    return EMPTY_DEVICES;
  }
}

/** Electron names when the OS can provide them. A browser, or a slow probe, returns nulls. */
export function getInputDeviceNames(): Promise<InputDeviceNames> {
  if (cache && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.value);
  if (!pending) {
    pending = loadInputDeviceNames()
      .then((value) => {
        cache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        pending = null;
      });
  }
  const current = pending;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(cache?.value ?? EMPTY_DEVICES), LOOKUP_MS);
    current.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(cache?.value ?? EMPTY_DEVICES);
      },
    );
  });
}

export function clearInputDeviceNameCache(): void {
  cache = null;
}

export function inputSourceFor(origin: 'keyboard' | 'dictation', devices: InputDeviceNames): InputSource {
  if (origin === 'dictation') return { kind: 'microphone', name: cleanInputDeviceName(devices.microphone) };
  return { kind: 'keyboard', name: cleanInputDeviceName(devices.keyboard) };
}

/** Fill a name that was still unknown when a new seal was written. Does not touch the hash. */
export function backfillInputSource<T extends { origin: 'keyboard' | 'dictation'; sealedAt: string; inputSource?: InputSource }>(
  point: T,
  devices: InputDeviceNames,
  now: string,
): T {
  if (!point.inputSource || point.inputSource.name) return point;
  const age = Date.parse(now) - Date.parse(point.sealedAt);
  if (!Number.isFinite(age) || age < 0 || age > INPUT_SOURCE_BACKFILL_MS) return point;
  const next = inputSourceFor(point.origin, devices);
  if (!next.name || next.kind !== point.inputSource.kind) return point;
  return { ...point, inputSource: next };
}

function isTimedKeystroke(event: KeystrokeEvent): boolean {
  if (event.inputType === 'insertCompositionText') return true;
  if (event.inputType !== 'insertText') return false;
  return (event.data?.length ?? 0) <= 1;
}

/** Count one typed key. Multi-character inserts are not a key rate. */
export function noteKeyboardPace(pace: KeyboardPace | undefined, event: KeystrokeEvent): KeyboardPace | undefined {
  if (!isTimedKeystroke(event)) return pace;
  const atMs = Date.parse(event.at);
  if (!Number.isFinite(atMs)) return pace;
  if (!pace) return { keystrokes: 1, firstAt: event.at, lastAt: event.at };
  if (Date.parse(pace.lastAt) > atMs) return { ...pace, keystrokes: pace.keystrokes + 1 };
  return { keystrokes: pace.keystrokes + 1, firstAt: pace.firstAt, lastAt: event.at };
}

export function inputSourceLine(point: { inputSource?: InputSource | null }): string {
  const name = point.inputSource?.name?.trim();
  if (!name) return INPUT_SOURCE_UNKNOWN;
  return `Input: ${name}`;
}

export function typingRateLine(point: { origin?: string | null; keyboardPace?: KeyboardPace | null }): string {
  if (point.origin !== 'keyboard') return TYPING_RATE_UNKNOWN;
  const pace = point.keyboardPace;
  if (!pace || pace.keystrokes < 2) return TYPING_RATE_UNKNOWN;
  const elapsed = Date.parse(pace.lastAt) - Date.parse(pace.firstAt);
  if (!Number.isFinite(elapsed) || elapsed <= 0) return TYPING_RATE_UNKNOWN;
  const perMinute = ((pace.keystrokes - 1) / elapsed) * 60_000;
  if (!Number.isFinite(perMinute) || perMinute <= 0) return TYPING_RATE_UNKNOWN;
  const rounded = Math.round(perMinute);
  if (rounded < 1) return 'Typing rate: under 1 key/min';
  const unit = rounded === 1 ? 'key' : 'keys';
  return `Typing rate: ${rounded} ${unit}/min`;
}
