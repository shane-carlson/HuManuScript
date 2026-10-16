import { useState } from 'react';
import { LibraryBackup } from './LibraryBackup.tsx';
import { VersionHistory } from './VersionHistory.tsx';
import type { Library } from '../core/library.ts';
import type { BookVersion, VersionLedger } from '../core/versions.ts';

type HistoryPanel = 'snapshots' | 'backup';

export function VersionHistoryPane({
  bookTitle,
  versions,
  onSaveVersion,
  onRestoreVersion,
  library,
  ledger,
  onImportBackup,
}: {
  bookTitle: string;
  versions: BookVersion[];
  onSaveVersion: (label: string) => void;
  onRestoreVersion: (versionId: string) => void;
  library: Library;
  ledger: VersionLedger;
  onImportBackup: (library: Library, versions: VersionLedger) => void;
}) {
  const [panel, setPanel] = useState<HistoryPanel>('snapshots');

  return (
    <div className="version-history-pane">
      <div className="version-history-pane__head">
        <div>
          <h2>Version history</h2>
        </div>
        <div className="book-pill">
          <span aria-hidden="true">📖</span>
          <b>{bookTitle}</b>
        </div>
      </div>

      <div className="version-history-tabs" role="tablist" aria-label="Version history">
        <button
          type="button"
          role="tab"
          id="version-tab-snapshots"
          aria-selected={panel === 'snapshots'}
          aria-controls="version-panel-snapshots"
          tabIndex={panel === 'snapshots' ? 0 : -1}
          className={panel === 'snapshots' ? 'is-active' : ''}
          onClick={() => setPanel('snapshots')}
        >
          Snapshots
        </button>
        <button
          type="button"
          role="tab"
          id="version-tab-backup"
          aria-selected={panel === 'backup'}
          aria-controls="version-panel-backup"
          tabIndex={panel === 'backup' ? 0 : -1}
          className={panel === 'backup' ? 'is-active' : ''}
          onClick={() => setPanel('backup')}
        >
          Backup &amp; restore
        </button>
      </div>

      <div
        role="tabpanel"
        id="version-panel-snapshots"
        aria-labelledby="version-tab-snapshots"
        hidden={panel !== 'snapshots'}
      >
        <VersionHistory
          bookTitle={bookTitle}
          versions={versions}
          onSave={onSaveVersion}
          onRestore={onRestoreVersion}
        />
      </div>
      <div
        role="tabpanel"
        id="version-panel-backup"
        aria-labelledby="version-tab-backup"
        hidden={panel !== 'backup'}
      >
        <LibraryBackup library={library} versions={ledger} onImport={onImportBackup} />
      </div>
    </div>
  );
}
