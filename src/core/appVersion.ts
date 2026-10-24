export type AppVersionInfo = {
  version: string;
  build: string;
};

/** Marketing version plus the build baked by the pack, e.g. `0.1.0 (42)`. */
export function formatAppVersion(info: AppVersionInfo): string {
  return `${info.version} (${info.build})`;
}
