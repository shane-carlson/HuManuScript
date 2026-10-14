import { useEffect, useState } from 'react';
import { Editor } from './components/Editor.tsx';
import { displayTitle, reconcileLoadedDocument, TRUST_STATEMENT, type ManuscriptDocument } from './core/document.ts';
import { createIdFactory } from './core/uid.ts';
import { clearManuscript, freshDocument, loadManuscript, saveManuscript, THEME_KEY } from './storage.ts';

type Phase = 'loading' | 'ready' | 'error';

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [doc, setDoc] = useState<ManuscriptDocument | null>(null);
  const [error, setError] = useState('');
  const [raw, setRaw] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = loadManuscript();
      if (!loaded.ok) {
        setError(loaded.error);
        setRaw(loaded.raw);
        setPhase('error');
        return;
      }
      const ids = createIdFactory('ms');
      const base = loaded.doc ?? freshDocument(ids());
      const reconciled = loaded.doc
        ? await reconcileLoadedDocument(base, new Date().toISOString(), ids)
        : base;
      if (cancelled) return;
      setDoc(reconciled);
      setPhase('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (phase !== 'ready' || !doc) return;
    const timer = window.setTimeout(() => saveManuscript(doc), 200);
    return () => window.clearTimeout(timer);
  }, [doc, phase]);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">H</span>
          <div>
            <p className="wordmark">HuManuScript</p>
            <p className="tag">Keyboard-sealed prose, on the Speak Fiction manuscript</p>
          </div>
        </div>
        {phase === 'ready' && doc && (
          <label className="title-field">
            <span>Title</span>
            <input
              value={doc.title}
              placeholder="Untitled manuscript"
              aria-label="Manuscript title"
              onChange={(e) => setDoc({ ...doc, title: e.target.value })}
            />
          </label>
        )}
        <button type="button" className="ghost" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? 'Dark paper' : 'Light paper'}
        </button>
      </header>
      <p className="trust-banner">{TRUST_STATEMENT}</p>
      {phase === 'loading' && (
        <section className="status" aria-live="polite">
          <h1>Opening the manuscript…</h1>
          <p>Reading the copy saved in this browser.</p>
        </section>
      )}
      {phase === 'error' && (
        <section className="status error" role="alert">
          <h1>This saved manuscript could not be opened.</h1>
          <p>{error}</p>
          <p>The broken copy is still in this browser. You can keep it, or start a fresh page. Starting fresh removes the saved file from this browser only.</p>
          <div className="status-actions">
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([raw], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'humanuscript-unreadable.json';
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download the broken copy
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                clearManuscript();
                setDoc(freshDocument(createIdFactory('ms')()));
                setPhase('ready');
              }}
            >
              Start a fresh manuscript
            </button>
          </div>
        </section>
      )}
      {phase === 'ready' && doc && (
        <>
          <p className="sr-only">Editing {displayTitle(doc)}</p>
          <Editor doc={doc} onChange={setDoc} />
        </>
      )}
    </div>
  );
}
