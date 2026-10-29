import { useEffect, useId, useState } from 'react';
import { READYWRITER_ACCOUNT_PAGE } from '../core/syncEndpoint.ts';
import { SYNC_COPY, syncStatusLine, type SyncPhase } from '../core/syncStatus.ts';
import { validateAccountForm } from '../core/syncClient.ts';

type FormResult = { message: string; pending?: boolean } | null;

export function SyncControl({
  phase,
  email,
  lastSyncAt,
  detail,
  onCreateAccount,
  onSignIn,
  onSyncNow,
  onSignOut,
}: {
  phase: SyncPhase;
  email: string | null;
  lastSyncAt: string | null;
  detail: string;
  onCreateAccount: (email: string, password: string, displayName: string) => Promise<FormResult>;
  onSignIn: (email: string, password: string) => Promise<FormResult>;
  onSyncNow: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<'create' | 'sign-in' | null>(null);
  const [emailDraft, setEmailDraft] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [formNotice, setFormNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const status = syncStatusLine({ phase, email, lastSyncAt });
  const busy = phase === 'syncing' || submitting;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const showingForm = form != null && phase !== 'success' && phase !== 'syncing';

  const closeForm = () => {
    setForm(null);
    setPassword('');
    setFormError('');
    setFormNotice('');
  };

  const submit = async (kind: 'create' | 'sign-in') => {
    const invalid = validateAccountForm(kind, emailDraft, password, displayName);
    if (invalid) {
      setFormNotice('');
      setFormError(invalid);
      return;
    }
    setSubmitting(true);
    setFormError('');
    setFormNotice('');
    const error = kind === 'create'
      ? await onCreateAccount(emailDraft, password, displayName)
      : await onSignIn(emailDraft, password);
    setSubmitting(false);
    setPassword('');
    if (error?.pending) {
      setForm('sign-in');
      setFormNotice(error.message);
      return;
    }
    if (error) {
      setFormError(error.message);
      return;
    }
    setForm(null);
    setDisplayName('');
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
              {phase !== 'syncing' && phase !== 'success' && phase !== 'failure' && email && !showingForm && (
                <p>{status}</p>
              )}
              {!email && !showingForm && phase !== 'syncing' && (
                <>
                  {detail && (
                    <p className="sync-panel__error" role="alert">
                      {detail}
                    </p>
                  )}
                  <p>{SYNC_COPY.signedOut}</p>
                  <p>{SYNC_COPY.notSentToAi}</p>
                  <p>
                    <a href={READYWRITER_ACCOUNT_PAGE}>Open your Ready Writer One account</a>
                  </p>
                </>
              )}
              {showingForm && form && (
                <form
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit(form);
                  }}
                >
                  <h3>{form === 'create' ? SYNC_COPY.createTitle : SYNC_COPY.signInTitle}</h3>
                  <p>{form === 'create' ? SYNC_COPY.notSentToAi : SYNC_COPY.signInHelp}</p>
                  <p>
                    <a href={READYWRITER_ACCOUNT_PAGE}>readywriter.one/account</a>
                  </p>
                  {form === 'create' && (
                    <label className="field">
                      Display name
                      <input
                        type="text"
                        autoComplete="nickname"
                        maxLength={40}
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                      />
                    </label>
                  )}
                  <label className="field">
                    Email
                    <input
                      type="email"
                      autoComplete="username"
                      value={emailDraft}
                      onChange={(event) => setEmailDraft(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    Password
                    <input
                      type="password"
                      autoComplete={form === 'create' ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                  {form === 'create' && <p className="sync-panel__hint">{SYNC_COPY.passwordHint}</p>}
                  {formNotice && (
                    <p className="sync-panel__notice" role="status">
                      {formNotice}
                    </p>
                  )}
                  {formError && (
                    <p className="sync-panel__error" role="alert">
                      {formError}
                    </p>
                  )}
                  <div className="sync-panel__actions">
                    <button type="submit" className="primary" disabled={busy}>
                      {form === 'create' ? 'Create account' : 'Sign in'}
                    </button>
                    <button type="button" onClick={closeForm} disabled={busy}>
                      Back
                    </button>
                  </div>
                </form>
              )}
              {!showingForm && (
                <div className="sync-panel__actions">
                  {!email && (
                    <>
                      <button type="button" className="primary" onClick={() => { setFormError(''); setFormNotice(''); setForm('create'); }} disabled={busy}>
                        Create account
                      </button>
                      <button type="button" onClick={() => { setFormError(''); setFormNotice(''); setForm('sign-in'); }} disabled={busy}>
                        Sign in
                      </button>
                    </>
                  )}
                  {email && (
                    <>
                      <button type="button" className="primary" onClick={onSyncNow} disabled={busy}>
                        Sync now
                      </button>
                      <button type="button" onClick={onSignOut} disabled={busy}>
                        Sign out
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
