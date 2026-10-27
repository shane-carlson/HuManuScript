import { useEffect, useState } from 'react';
import { updateAvailableMessage } from '../core/appUpdate.ts';

export function UpdateAvailableNotice() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const bridge = window.humanuscript;
    if (!bridge?.onUpdateAvailable) return;
    const apply = (update: { version?: string } | null | undefined) => {
      if (!update) return;
      setMessage(updateAvailableMessage(update.version ?? ''));
    };
    apply(bridge.getUpdateAvailable?.() ?? null);
    return bridge.onUpdateAvailable(apply);
  }, []);

  if (!message) return null;
  return (
    <p className="update-available" role="status" aria-live="polite">
      {message}
    </p>
  );
}
