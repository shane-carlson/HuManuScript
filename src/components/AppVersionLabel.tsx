import { appVersion } from 'virtual:app-version';
import { formatAppVersion } from '../core/appVersion.ts';

export function AppVersionLabel({ className = 'app-version' }: { className?: string }) {
  const label = formatAppVersion(appVersion);
  return (
    <p className={className} data-app-version={label}>
      {label}
    </p>
  );
}
