/** Cloud drives a library backup can live in. The desktop app uses the synced folder when it is installed. */

export const CLOUD_PROVIDERS = [
  { id: 'google-drive', label: 'Google Drive' },
  { id: 'onedrive', label: 'OneDrive' },
  { id: 'box', label: 'Box' },
  { id: 'dropbox', label: 'Dropbox' },
  { id: 'icloud', label: 'iCloud Drive' },
  { id: 'mega', label: 'MEGA' },
  { id: 'pcloud', label: 'pCloud' },
] as const;

export type CloudProviderId = (typeof CLOUD_PROVIDERS)[number]['id'];

export const CLOUD_BACKUP_DIR = 'HuManuScript';

export function cloudProviderLabel(id: string): string {
  return CLOUD_PROVIDERS.find((provider) => provider.id === id)?.label ?? 'Cloud drive';
}

export function isCloudProviderId(id: string): id is CloudProviderId {
  return CLOUD_PROVIDERS.some((provider) => provider.id === id);
}

/** Names produced by backupFilename, and nothing that could leave the backup folder. */
export function isCloudBackupFilename(name: string): boolean {
  return /^humanuscript-library-[A-Za-z0-9._-]+\.json$/.test(name);
}
