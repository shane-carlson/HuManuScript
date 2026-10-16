/** Label for the device that produced keyboard certification (display only; not part of the seal hash). */

export type HumanuscriptBridge = {
  getDeviceName?: () => Promise<string> | string;
  /** Electron built-in dictionary. Absent in a browser that cannot read suggestions. */
  getSpellSuggestions?: (word: string) => string[];
};

declare global {
  interface Window {
    humanuscript?: HumanuscriptBridge;
  }
}

let cached: string | null | undefined;

function cleanLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function browserDeviceLabel(): Promise<string | null> {
  const nav = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
      getHighEntropyValues?: (hints: string[]) => Promise<{ platform?: string; model?: string }>;
    };
  };
  const uaData = nav.userAgentData;
  if (uaData?.getHighEntropyValues) {
    try {
      const hints = await uaData.getHighEntropyValues(['platform', 'model']);
      const model = cleanLabel(hints.model);
      const platform = cleanLabel(hints.platform ?? uaData.platform);
      if (model && model !== '' && model.toLowerCase() !== 'unknown') return model;
      if (platform) return platform;
    } catch {
      /* high-entropy hints may be denied */
    }
  }
  const platform = cleanLabel(uaData?.platform);
  if (platform) return platform;
  return null;
}

/** Electron: computer name. Browser: platform/model from client hints when available; otherwise null (do not invent). */
export async function getTypingDeviceLabel(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const bridge = window.humanuscript?.getDeviceName;
    if (typeof bridge === 'function') {
      const name = cleanLabel(await Promise.resolve(bridge()));
      cached = name;
      return name;
    }
  } catch {
    cached = null;
    return null;
  }
  cached = await browserDeviceLabel();
  return cached;
}

export function formatTypingDeviceLabel(label: string | null | undefined): string {
  if (label) return label;
  return 'Device name unavailable in this browser';
}
