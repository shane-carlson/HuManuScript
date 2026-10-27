import type { useLicense } from '../hooks/useLicense.ts';
import { LicenseActions } from './LicenseActions.tsx';

export function LicenseGate({ license }: { license: ReturnType<typeof useLicense> }) {
  const { status } = license;
  if (status.mayWrite) return null;

  return (
    <div className="license-gate" role="dialog" aria-labelledby="license-gate-title">
      <h3 id="license-gate-title">License required to keep writing</h3>
      <p>{status.message}</p>
      <p className="sub">
        Your library and exports stay available. Activate a Polar license to edit the manuscript again. One key
        works on {status.activationLimit} machines.
      </p>
      <LicenseActions
        status={status}
        busy={license.busy}
        error={license.error}
        onBuy={() => void license.buy()}
        onActivate={license.activate}
      />
    </div>
  );
}
