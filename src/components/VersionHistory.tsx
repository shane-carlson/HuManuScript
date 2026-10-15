import { useState } from 'react';
import { versionDisplayLabel, type BookVersion } from '../core/versions.ts';

export function VersionHistory({
  bookTitle,
  versions,
  onSave,
  onRestore,
}: {
  bookTitle: string;
  versions: BookVersion[];
  onSave: (label: string) => void;
  onRestore: (versionId: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const save = () => {
    onSave(label);
    setLabel('');
  };

  const restore = async (id: string) => {
    if (!window.confirm('Restore this version? Your current manuscript will be saved as “Before restore” first.')) return;
    setBusy(id);
    try {
      onRestore(id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="workspace-versions card-inset">
      <h3>Version history</h3>
      <p className="sub">Named snapshots for <strong>{bookTitle}</strong>, like Speak Fiction book versions. Restore rolls back the whole book.</p>
      <div className="version-save">
        <label className="field">
          <span>Version name</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Pre-agent pass"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
          />
        </label>
        <button type="button" className="primary version-save__btn" onClick={save}>
          New version
        </button>
      </div>
      {versions.length === 0 ? (
        <p className="version-empty">No versions yet. Save one before a big rewrite.</p>
      ) : (
        <ol className="version-list">
          {versions.map((version, index) => (
            <li key={version.id}>
              <div className="version-list__main">
                <span className="version-list__label">{versionDisplayLabel(version, index)}</span>
                <time className="version-list__time" dateTime={version.savedAt}>
                  {new Date(version.savedAt).toLocaleString()}
                </time>
                {version.kind !== 'manual' && (
                  <span className="version-list__kind">{version.kind === 'auto' ? 'Auto' : 'Safety'}</span>
                )}
              </div>
              <button
                type="button"
                className="version-list__restore"
                disabled={busy === version.id}
                onClick={() => restore(version.id)}
              >
                Restore
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
