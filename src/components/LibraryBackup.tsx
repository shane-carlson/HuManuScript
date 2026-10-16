import { useEffect, useMemo, useRef, useState } from 'react';
import { backupFilename, buildLibraryBackup, mergeBackupIntoLibrary, parseLibraryBackup } from '../core/backup.ts';
import { bookDisplayTitle, type Library } from '../core/library.ts';
import type { VersionLedger } from '../core/versions.ts';

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function LibraryBackup({
  library,
  versions,
  onImport,
}: {
  library: Library;
  versions: VersionLedger;
  onImport: (library: Library, versions: VersionLedger) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(library.books.map((b) => b.id)));
  const [message, setMessage] = useState<string | null>(null);

  const allIds = useMemo(() => library.books.map((b) => b.id), [library.books]);

  useEffect(() => {
    const valid = new Set(allIds);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of allIds) {
        if (!prev.has(id)) next.add(id);
      }
      for (const id of [...next]) {
        if (!valid.has(id)) next.delete(id);
      }
      return next;
    });
  }, [allIds]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setAll = (on: boolean) => {
    setSelected(on ? new Set(allIds) : new Set());
  };

  const download = () => {
    const ids = [...selected];
    if (!ids.length) {
      setMessage('Select at least one book to back up.');
      return;
    }
    const exportedAt = new Date().toISOString();
    const payload = buildLibraryBackup({ library, bookIds: ids, versions, exportedAt });
    downloadJson(backupFilename(exportedAt), payload);
    setMessage(`Backed up ${ids.length} book${ids.length === 1 ? '' : 's'}.`);
  };

  const onFile = async (file: File) => {
    try {
      const text = await file.text();
      const backup = parseLibraryBackup(text);
      if (
        !window.confirm(
          `Import ${backup.books.length} book(s) from backup? Books with the same id will be replaced; new books will be added.`,
        )
      ) {
        return;
      }
      const merged = mergeBackupIntoLibrary(library, backup, versions);
      onImport(merged.library, merged.versions);
      setMessage(`Restored ${backup.books.length} book(s) from backup.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read backup file.');
    }
  };

  return (
    <section className="workspace-backup card-inset">
      <h3 className="sr-only">Backup &amp; restore</h3>
      <p className="sub">Download a portable JSON backup. Choose which books to include (default: all).</p>
      <div className="backup-actions">
        <button type="button" onClick={() => setAll(true)}>Select all</button>
        <button type="button" onClick={() => setAll(false)}>Select none</button>
      </div>
      <ul className="backup-book-pick">
        {library.books.map((book) => (
          <li key={book.id}>
            <label>
              <input
                type="checkbox"
                checked={selected.has(book.id)}
                onChange={() => toggle(book.id)}
              />
              {bookDisplayTitle(book)}
            </label>
          </li>
        ))}
      </ul>
      <div className="backup-buttons">
        <button type="button" className="primary" onClick={download}>Download backup</button>
        <button type="button" onClick={() => fileRef.current?.click()}>Restore from file…</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void onFile(file);
          }}
        />
      </div>
      {message && <p className="backup-message" role="status">{message}</p>}
    </section>
  );
}
