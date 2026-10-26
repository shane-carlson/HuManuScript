import { useEffect, useMemo, useRef, useState } from 'react';
import { backupFilename, buildLibraryBackup, mergeBackupIntoLibrary, parseLibraryBackup } from '../core/backup.ts';
import { listCloudBackups, readCloudBackup, saveCloudBackup } from '../core/cloudBackup.ts';
import { CLOUD_PROVIDERS, cloudProviderLabel, type CloudProviderId } from '../core/cloudProviders.ts';
import type { CloudBackupEntry } from '../core/deviceName.ts';
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
  const [busy, setBusy] = useState(false);
  const [cloudFiles, setCloudFiles] = useState<{ provider: CloudProviderId; files: CloudBackupEntry[] } | null>(null);

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

  const payloadForSelection = () => {
    const ids = [...selected];
    if (!ids.length) {
      setMessage('Select at least one book to back up.');
      return null;
    }
    const exportedAt = new Date().toISOString();
    return {
      ids,
      filename: backupFilename(exportedAt),
      payload: buildLibraryBackup({ library, bookIds: ids, versions, exportedAt }),
    };
  };

  const download = () => {
    const built = payloadForSelection();
    if (!built) return;
    downloadJson(built.filename, built.payload);
    setMessage(`Backed up ${built.ids.length} book${built.ids.length === 1 ? '' : 's'}.`);
  };

  const importText = (text: string) => {
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
    setCloudFiles(null);
    setMessage(`Restored ${backup.books.length} book(s) from backup.`);
  };

  const onFile = async (file: File) => {
    try {
      importText(await file.text());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read backup file.');
    }
  };

  const backupToCloud = async (provider: CloudProviderId) => {
    const built = payloadForSelection();
    if (!built) return;
    const label = cloudProviderLabel(provider);
    setBusy(true);
    setMessage(`Saving to ${label}…`);
    try {
      await saveCloudBackup(provider, built.filename, JSON.stringify(built.payload, null, 2));
      setMessage(`Backed up ${built.ids.length} book${built.ids.length === 1 ? '' : 's'} to ${label}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not back up to ${label}.`);
    } finally {
      setBusy(false);
    }
  };

  const restoreFromCloud = async (provider: CloudProviderId) => {
    const label = cloudProviderLabel(provider);
    setBusy(true);
    setCloudFiles(null);
    setMessage(`Looking for backups in ${label}…`);
    try {
      const files = await listCloudBackups(provider);
      if (!files.length) {
        setMessage(`No HuManuScript backups in ${label} yet.`);
        return;
      }
      setCloudFiles({ provider, files });
      setMessage(`Choose a backup from ${label}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not read ${label}.`);
    } finally {
      setBusy(false);
    }
  };

  const openCloudFile = async (provider: CloudProviderId, filename: string) => {
    setBusy(true);
    try {
      importText(await readCloudBackup(provider, filename));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read backup file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="workspace-backup card-inset">
      <h3 className="sr-only">Backup &amp; restore</h3>
      <p className="sub">
        Back up the selected books to this computer, or to Google Drive, OneDrive, Box, Dropbox, iCloud Drive, MEGA, or pCloud.
        A cloud backup is a HuManuScript folder in that drive.
      </p>
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
        <DestinationMenu
          label="Backup to"
          primary
          disabled={busy}
          onComputer={download}
          computerLabel="This computer"
          onCloud={(provider) => void backupToCloud(provider)}
        />
        <DestinationMenu
          label="Restore from"
          disabled={busy}
          onComputer={() => fileRef.current?.click()}
          computerLabel="A file…"
          onCloud={(provider) => void restoreFromCloud(provider)}
        />
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
      {cloudFiles && (
        <ul className="backup-cloud-list" aria-label={`Backups in ${cloudProviderLabel(cloudFiles.provider)}`}>
          {cloudFiles.files.map((file) => (
            <li key={file.name}>
              <button type="button" disabled={busy} onClick={() => void openCloudFile(cloudFiles.provider, file.name)}>
                {file.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="backup-message" role="status">{message}</p>}
    </section>
  );
}

function DestinationMenu({
  label,
  primary = false,
  disabled,
  onComputer,
  computerLabel,
  onCloud,
}: {
  label: string;
  primary?: boolean;
  disabled: boolean;
  onComputer: () => void;
  computerLabel: string;
  onCloud: (provider: CloudProviderId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="backup-menu" ref={ref}>
      <button
        type="button"
        className={primary ? 'primary' : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open && (
        <div className="backup-menu__list" role="menu" aria-label={label}>
          <button type="button" role="menuitem" onClick={() => choose(onComputer)}>{computerLabel}</button>
          {CLOUD_PROVIDERS.map((provider) => (
            <button key={provider.id} type="button" role="menuitem" onClick={() => choose(() => onCloud(provider.id))}>
              {provider.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
