import {
  bookDisplayTitle,
  createBook,
  groupLibraryBooks,
  seriesMembershipLabel,
  type Book,
  type Library,
} from '../core/library.ts';
import type { WorkspaceTab } from '../storage.ts';
import type { useLicense } from '../hooks/useLicense.ts';
import { LicenseBanner } from './LicenseBanner.tsx';

export function WorkspaceSidebar({
  library,
  tab,
  collapsed,
  onToggleCollapsed,
  onTabChange,
  onLibraryChange,
  newId,
  license,
}: {
  library: Library;
  tab: WorkspaceTab;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onTabChange: (tab: WorkspaceTab) => void;
  onLibraryChange: (library: Library) => void;
  newId: () => string;
  license: ReturnType<typeof useLicense>;
}) {
  const active = library.books.find((b) => b.id === library.activeBookId) ?? library.books[0];

  if (!active) return null;

  const groups = groupLibraryBooks(library.books, library.series);

  const selectBook = (bookId: string) => {
    if (bookId === library.activeBookId) return;
    onLibraryChange({ ...library, activeBookId: bookId });
  };

  return (
    <aside className={`workspace-sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <button
        type="button"
        className="sidebar-collapse-toggle"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand library pane' : 'Collapse library pane'}
        data-tooltip={collapsed ? 'Expand library' : 'Collapse library'}
      >
        {collapsed ? '›' : '‹'}
      </button>
      <nav className="workspace-nav" aria-label="Workspace">
        <button
          type="button"
          className={`workspace-nav__item${tab === 'manuscript' ? ' is-active' : ''}`}
          onClick={() => onTabChange('manuscript')}
          data-tooltip="Manuscript"
        >
          <span className="ico" aria-hidden="true">✍️</span>
          <span className="workspace-nav__label">Manuscript</span>
        </button>
        <button
          type="button"
          className={`workspace-nav__item${tab === 'export' ? ' is-active' : ''}`}
          onClick={() => onTabChange('export')}
          data-tooltip="Export"
        >
          <span className="ico" aria-hidden="true">🔗</span>
          <span className="workspace-nav__label">Export</span>
        </button>
        <button
          type="button"
          className={`workspace-nav__item${tab === 'history' ? ' is-active' : ''}`}
          onClick={() => onTabChange('history')}
          data-tooltip="Version history"
        >
          <span className="ico" aria-hidden="true">🕘</span>
          <span className="workspace-nav__label">Version history</span>
        </button>
      </nav>

      <div className="workspace-sidebar__body">
      <section className="workspace-books">
        <div className="workspace-books__head">
          <h3>Books</h3>
          <button
            type="button"
            className="workspace-books__new"
            disabled={!license.mayWrite}
            title={license.mayWrite ? undefined : 'A license is required to start another book'}
            onClick={() => onLibraryChange(createBook(library, newId(), 'Untitled book'))}
          >
            New book
          </button>
        </div>
        <div className="book-list" role="listbox" aria-label="Books in library">
          {groups.map((group) => (
            <div key={group.id} className="book-group">
              {group.heading && <div className="book-group__heading">{group.heading}</div>}
              {group.books.map((book: Book) => {
                const membership = seriesMembershipLabel(
                  book,
                  library.series.find((s) => s.id === book.seriesId)?.name,
                );
                const selected = book.id === library.activeBookId;
                return (
                  <button
                    key={book.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`book-row${selected ? ' is-active' : ''}`}
                    onClick={() => selectBook(book.id)}
                  >
                    <span className="book-row__title">{bookDisplayTitle(book)}</span>
                    {membership && <span className="book-row__meta">{membership}</span>}
                    {book.registryReceipts && book.registryReceipts.length > 0 ? (
                      <span className="book-row__meta book-row__code">
                        Certified Manuscript Registry {book.registryReceipts[book.registryReceipts.length - 1]!.code}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      </div>
      <LicenseBanner license={license} />
    </aside>
  );
}
