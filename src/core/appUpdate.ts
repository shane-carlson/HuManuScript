/** Line shown when electron-updater finds a newer GitHub Release. */
export function updateAvailableMessage(version: string): string {
  const trimmed = version.trim();
  if (/^[0-9]+(?:\.[0-9A-Za-z]+){1,3}$/.test(trimmed)) return `Update ${trimmed} is available.`;
  return 'An update is available.';
}
