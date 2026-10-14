import { useEffect, useState } from 'react';
import {
  assignSeriesToBook,
  bookDisplayTitle,
  createBook,
  formatSeriesBookNumber,
  groupLibraryBooks,
  seriesMembershipLabel,
  setBookSeriesNumber,
  type Book,
  type Library,
} from '../core/library.ts';
import type { WorkspaceTab } from '../storage.ts';

export function WorkspaceSidebar({
  library,
  tab,
  collapsed,
  onToggleCollapsed,
  onTabChange,
  onLibraryChange,
  newId,
}: {
  library: Library;
  tab: WorkspaceTab;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onTabChange: (tab: WorkspaceTab) => void;
  onLibraryChange: (library: Library) => void;
  newId: () => string;
}) {
  const active = library.books.find((b) => b.id === library.activeBookId) ?? library.books[0];
  const seriesName = active?.seriesId
    ? library.series.find((s) => s.id === active.seriesId)?.name ?? ''
    : '';
  const [seriesDraft, setSeriesDraft] = useState(seriesName);
  const [numberDraft, setNumberDraft] = useState(
    active?.seriesBookNumber != null ? formatSeriesBookNumber(active.seriesBookNumber) : '',
  );

  useEffect(() => {
    setSeriesDraft(seriesName);
    setNumberDraft(active?.seriesBookNumber != null ? formatSeriesBookNumber(active.seriesBookNumber) : '');
  }, [active?.id, seriesName, active?.seriesBookNumber]);

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
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '›' : '‹'}
      </button>
      <nav className="workspace-nav" aria-label="Workspace">
        <button
          type="button"
          className={`workspace-nav__item${tab === 'manuscript' ? ' is-active' : ''}`}
          onClick={() => onTabChange('manuscript')}
          title="Manuscript"
        >
          <span className="ico" aria-hidden="true">✍️</span>
          <span className="workspace-nav__label">Manuscript</span>
        </button>
        <button
          type="button"
          className={`workspace-nav__item${tab === 'export' ? ' is-active' : ''}`}
          onClick={() => onTabChange('export')}
          title="Export"
        >
          <span className="ico" aria-hidden="true">🔗</span>
          <span className="workspace-nav__label">Export</span>
        </button>
      </nav>

      <div className="workspace-sidebar__body">
      <section className="workspace-books">
        <div className="workspace-books__head">
          <h3>Books</h3>
          <button
            type="button"
            className="workspace-books__new"
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
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="workspace-series card-inset">
        <h3>Series</h3>
        <p className="sub">A book belongs to a series, like Speak Fiction’s library. Leave blank for standalone.</p>
        <label className="field">
          <span>Series (optional)</span>
          <input
            list="humanuscript-series"
            value={seriesDraft}
            onChange={(e) => setSeriesDraft(e.target.value)}
            onBlur={() => onLibraryChange(assignSeriesToBook(library, active.id, seriesDraft, newId))}
            placeholder="Leave blank for standalone"
          />
        </label>
        <datalist id="humanuscript-series">
          {library.series.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
        {active.seriesId ? (
          <label className="field">
            <span>Book number in series</span>
            <input
              type="text"
              inputMode="decimal"
              value={numberDraft}
              onChange={(e) => setNumberDraft(e.target.value)}
              onBlur={() => onLibraryChange(setBookSeriesNumber(library, active.id, numberDraft))}
              placeholder="e.g. 1"
            />
          </label>
        ) : null}
      </section>
      </div>
    </aside>
  );
}
