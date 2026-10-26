export type AppVersionInfo = {
  version: string;
  build: string;
  label?: string;
};

/**
 * What the header and window title show.
 * A signed pack bakes `0.1.<build>`. Local and unsigned packs stay `0.1.0 (dev)`.
 */
export function formatAppVersion(info: AppVersionInfo): string {
  if (info.label) return info.label;
  if (info.build === 'dev') return `${info.version} (${info.build})`;
  return info.version;
}
