import { useEffect, useState } from 'react';
import { WRITING_TOOLS } from '../core/accountTools.ts';
import {
  readWritingTools,
  validateAccountForm,
  type AccountToolLine,
} from '../core/syncClient.ts';
import { SYNC_COPY } from '../core/syncStatus.ts';

type AccountMode = 'sign-in' | 'sign-up' | 'manage';
type FormResult = { message: string; pending?: boolean } | null;

export function AccountPage({
  mode,
  email,
  displayName,
  token,
  onBack,
  onCreateAccount,
  onSignIn,
  onSignOut,
  onSyncNow,
  onUpdateName,
  onChangePassword,
}: {
  mode: AccountMode;
  email: string | null;
  displayName: string | null;
  token: string | null;
  onBack: () => void;
  onCreateAccount: (email: string, password: string, displayName: string) => Promise<FormResult>;
  onSignIn: (email: string, password: string) => Promise<FormResult>;
  onSignOut: () => void;
  onSyncNow: () => void;
  onUpdateName: (displayName: string) => Promise<FormResult>;
  onChangePassword: (currentPassword: string, password: string) => Promise<FormResult>;
}) {
  const [screen, setScreen] = useState<AccountMode>(mode);
  const [emailDraft, setEmailDraft] = useState(email ?? '');
  const [nameDraft, setNameDraft] = useState(displayName ?? '');
  const [password, setPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [formNotice, setFormNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tools, setTools] = useState<AccountToolLine[]>(
    WRITING_TOOLS.map((tool) => ({ ...tool, connected: tool.id === 'humanuscript' && Boolean(email) })),
  );

  useEffect(() => {
    setScreen(mode);
  }, [mode]);

  useEffect(() => {
    setNameDraft(displayName ?? '');
  }, [displayName]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  useEffect(() => {
    if (screen !== 'manage' || !token) return;
    let cancelled = false;
    void readWritingTools(token).then((result) => {
      if (!cancelled && result.ok) setTools(result.tools);
    });
    return () => {
      cancelled = true;
    };
  }, [screen, token]);

  const submitAuth = async (kind: 'sign-in' | 'sign-up') => {
    const invalid = validateAccountForm(kind === 'sign-up' ? 'create' : 'sign-in', emailDraft, password, nameDraft);
    if (invalid) {
      setFormNotice('');
      setFormError(invalid);
      return;
    }
    setSubmitting(true);
    setFormError('');
    setFormNotice('');
    const error = kind === 'sign-up'
      ? await onCreateAccount(emailDraft, password, nameDraft)
      : await onSignIn(emailDraft, password);
    setSubmitting(false);
    setPassword('');
    if (error?.pending) {
      setScreen('sign-in');
      setFormNotice(error.message);
      return;
    }
    if (error) {
      setFormError(error.message);
      return;
    }
    onBack();
  };

  const saveName = async () => {
    setSubmitting(true);
    setFormError('');
    setFormNotice('');
    const error = await onUpdateName(nameDraft);
    setSubmitting(false);
    if (error) setFormError(error.message);
    else setFormNotice('Display name saved.');
  };

  const savePassword = async () => {
    setSubmitting(true);
    setFormError('');
    setFormNotice('');
    const error = await onChangePassword(password, nextPassword);
    setSubmitting(false);
    setPassword('');
    setNextPassword('');
    if (error) setFormError(error.message);
    else setFormNotice('Password changed. You are still signed in.');
  };

  return (
    <div className="account-page">
      <div className="account-page__bar">
        <button type="button" className="account-page__back" onClick={onBack}>
          Back to manuscript
        </button>
        <p className="account-page__brand">HuManuScript</p>
      </div>
      <header className="account-page__head">
        <h2>{screen === 'manage' ? 'Account' : screen === 'sign-up' ? SYNC_COPY.createTitle : SYNC_COPY.signInTitle}</h2>
        <p>
          {screen === 'manage'
            ? 'This is your HuManuScript account. SpeakFiction and other writing tools can use the same sign-in later.'
            : 'Create the account here, or sign in. You can come back to the manuscript at any time.'}
        </p>
      </header>

      {screen !== 'manage' && (
        <form
          className="account-page__form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submitAuth(screen);
          }}
        >
          {screen === 'sign-up' && (
            <label className="field">
              Display name
              <input
                type="text"
                autoComplete="nickname"
                maxLength={40}
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
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
              autoComplete={screen === 'sign-up' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {screen === 'sign-up' && <p className="account-page__hint">{SYNC_COPY.passwordHint}</p>}
          <p>{screen === 'sign-up' ? SYNC_COPY.notSentToAi : SYNC_COPY.signInHelp}</p>
          {formNotice && <p className="account-page__notice" role="status">{formNotice}</p>}
          {formError && <p className="account-page__error" role="alert">{formError}</p>}
          <div className="account-page__actions">
            <button type="submit" className="primary" disabled={submitting}>
              {screen === 'sign-up' ? 'Create account' : 'Sign in'}
            </button>
            <button type="button" onClick={onBack}>
              Back to manuscript
            </button>
            <button
              type="button"
              onClick={() => {
                setFormError('');
                setFormNotice('');
                setScreen(screen === 'sign-up' ? 'sign-in' : 'sign-up');
              }}
            >
              {screen === 'sign-up' ? 'Have an account? Sign in' : 'Need an account? Create one'}
            </button>
          </div>
        </form>
      )}

      {screen === 'manage' && email && (
        <div className="account-page__manage">
          <p>Signed in as <strong>{email}</strong></p>
          <form
            className="account-page__form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <label className="field">
              Display name
              <input
                type="text"
                maxLength={40}
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
              />
            </label>
            <button type="submit" className="primary" disabled={submitting}>Save name</button>
          </form>
          <form
            className="account-page__form"
            onSubmit={(event) => {
              event.preventDefault();
              void savePassword();
            }}
          >
            <label className="field">
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="field">
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
              />
            </label>
            <p className="account-page__hint">{SYNC_COPY.passwordHint}</p>
            <button type="submit" disabled={submitting}>Change password</button>
          </form>
          <h3>Writing tools</h3>
          <ul className="account-page__tools">
            {tools.map((tool) => (
              <li key={tool.id}>
                <strong>{tool.name}</strong>
                <span>
                  {tool.connected
                    ? tool.sync
                      ? 'Connected. This app syncs its books here.'
                      : 'Connected. That app will use this sign-in when it is ready.'
                    : 'Available later. It can use this same account.'}
                </span>
              </li>
            ))}
          </ul>
          {formNotice && <p className="account-page__notice" role="status">{formNotice}</p>}
          {formError && <p className="account-page__error" role="alert">{formError}</p>}
          <div className="account-page__actions">
            <button type="button" className="primary" onClick={onSyncNow}>Sync now</button>
            <button type="button" onClick={onBack}>Back to manuscript</button>
            <button type="button" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      )}

      {screen === 'manage' && !email && (
        <div className="account-page__actions">
          <p>You are signed out.</p>
          <button type="button" className="primary" onClick={() => setScreen('sign-in')}>Sign in</button>
          <button type="button" onClick={onBack}>Back to manuscript</button>
        </div>
      )}
    </div>
  );
}
