import { useCallback, useEffect, useState } from 'react';
import { UNGATED_STATUS, type LicenseActivateResult, type LicenseStatus } from '../core/license.ts';

function licenseBridge() {
  return window.humanuscript?.license;
}

export function useLicense() {
  const [status, setStatus] = useState<LicenseStatus>(UNGATED_STATUS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const bridge = licenseBridge();
    if (!bridge) return;
    try {
      setStatus(await bridge.getStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the license status.');
    }
  }, []);

  useEffect(() => {
    const bridge = licenseBridge();
    if (!bridge) return;
    let cancelled = false;
    bridge.getStatus().then(
      (next) => {
        if (!cancelled) setStatus(next);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not read the license status.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const buy = useCallback(async () => {
    setError(null);
    const bridge = licenseBridge();
    if (!bridge) {
      setError('License checkout is only available in the HuManuScript app.');
      return;
    }
    const result = await bridge.buy();
    if (!result.ok) setError(result.error || 'Could not open Polar checkout.');
  }, []);

  const activate = useCallback(
    async (key: string): Promise<LicenseActivateResult> => {
      setError(null);
      setBusy(true);
      const bridge = licenseBridge();
      if (!bridge) {
        const result = { ok: false as const, status, error: 'Activate a license in the HuManuScript app.' };
        setError(result.error);
        setBusy(false);
        return result;
      }
      try {
        const result = await bridge.activate(key);
        setStatus(result.status);
        if (!result.ok) setError(result.error || 'Could not activate that license key.');
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not activate that license key.';
        setError(message);
        return { ok: false, status, error: message };
      } finally {
        setBusy(false);
      }
    },
    [status],
  );

  return { status, busy, error, setError, refresh, buy, activate, mayWrite: status.mayWrite };
}
