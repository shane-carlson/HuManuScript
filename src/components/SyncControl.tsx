import { useEffect, useId, useState } from 'react';
import { SYNC_COPY, syncStatusLine, type SyncPhase } from '../core/syncStatus.ts';

export function SyncControl({
  phase,
  email,
  lastSyncAt,
  detail,
  onOpenAccount,
  onSyncNow,
  onSignOut,
}: {
  phase: SyncPhase;
  email: string | null;
  lastSyncAt: string | null;
  detail: string;
  onOpenAccount: (mode: 'sign-in' | 'sign-up' | 'manage') => void;
  onSyncNow: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const status = syncStatusLine({ phase, email, lastSyncAt });
  const busy = phase === 'syncing';

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openAccount = (mode: 'sign-in' | 'sign-up' | 'manage') => {
    setOpen(false);
    onOpenAccount(mode);
  };

  return (
    <div className="sync-cluster">
      <p className="sync-status" role="status" aria-live="polite">
        {status}
      </p>
      <div className="sync-control">
        <button
          type="button"
          className="ghost"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? 'sync-panel' : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          Sync
        </button>
        {open && (
          <>
            <button type="button" className="sync-backdrop" aria-label="Close sync" onClick={() => setOpen(false)} />
            <div
              id="sync-panel"
              className={`sync-panel${phase === 'failure' ? ' is-failure' : ''}${phase === 'success' ? ' is-success' : ''}`}
              role="dialog"
              aria-labelledby={titleId}
              aria-busy={busy}
            >
              <h2 id={titleId}>Sync</h2>
              {phase === 'syncing' && <p>{SYNC_COPY.syncing}</p>}
              {phase === 'success' && (
                <>
                  <p className="sync-panel__ok">{SYNC_COPY.success}</p>
                  <p>{status}</p>
                </>
              )}
              {phase === 'failure' && (
                <>
                  <p className="sync-panel__error" role="alert">
                    {detail || 'Sync did not finish.'}
                  </p>
                  <p>{SYNC_COPY.failureKept}</p>
                </>
              )}
              {phase !== 'syncing' && phase !== 'success' && phase !== 'failure' && email && (
                <p>{status}</p>
              )}
              {!email && phase !== 'syncing' && (
                <>
                  {detail && (
                    <p className="sync-panel__error" role="alert">
                      {detail}
                    </p>
                  )}
                  <p>{SYNC_COPY.signedOut}</p>
                  <p>{SYNC_COPY.notSentToAi}</p>
                </>
              )}
              <div className="sync-panel__actions">
                {!email && (
                  <>
                    <button type="button" className="primary" onClick={() => openAccount('sign-up')} disabled={busy}>
                      Create account
                    </button>
                    <button type="button" onClick={() => openAccount('sign-in')} disabled={busy}>
                      Sign in
                    </button>
                  </>
                )}
                {email && (
                  <>
                    <button type="button" className="primary" onClick={onSyncNow} disabled={busy}>
                      Sync now
                    </button>
                    <button type="button" onClick={() => openAccount('manage')} disabled={busy}>
                      Account
                    </button>
                    <button type="button" onClick={onSignOut} disabled={busy}>
                      Sign out
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
