import { useState } from 'react';
import {
  bookDisplayTitle,
  createBook,
  groupLibraryBooks,
  seriesMembershipLabel,
  type Book,
  type Library,
} from '../core/library.ts';
import { isWorkspaceTab, reorderWorkspaceTabs, type WorkspaceTab } from '../core/workspaceTabs.ts';
import { loadWorkspaceTabOrder, saveWorkspaceTabOrder } from '../storage.ts';
import type { useLicense } from '../hooks/useLicense.ts';
import { LicenseBanner } from './LicenseBanner.tsx';

const TAB_ITEMS: readonly { id: WorkspaceTab; label: string; icon: string }[] = [
  { id: 'manuscript', label: 'Manuscript', icon: '✍️' },
  { id: 'streaks', label: 'Stats & Streaks', icon: '✶' },
  { id: 'export', label: 'Export', icon: '🔗' },
  { id: 'history', label: 'Version history', icon: '🕘' },
];

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
  const [order, setOrder] = useState<WorkspaceTab[]>(() => loadWorkspaceTabOrder());
  const [dragId, setDragId] = useState<WorkspaceTab | null>(null);
  const [overId, setOverId] = useState<WorkspaceTab | null>(null);
  const active = library.books.find((b) => b.id === library.activeBookId) ?? library.books[0];

  if (!active) return null;

  const groups = groupLibraryBooks(library.books, library.series);

  const moveTab = (from: WorkspaceTab, to: WorkspaceTab) => {
    setOrder((current) => {
      const next = reorderWorkspaceTabs(current, from, to);
      saveWorkspaceTabOrder(next);
      return next;
    });
  };

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
        {order.map((id) => {
          const item = TAB_ITEMS.find((entry) => entry.id === id);
          if (!item) return null;
          const dragging = dragId === id;
          const dropTarget = overId === id && dragId != null && dragId !== id;
          return (
            <button
              key={id}
              type="button"
              draggable
              className={`workspace-nav__item${tab === id ? ' is-active' : ''}${dragging ? ' is-dragging' : ''}${dropTarget ? ' is-drop-target' : ''}`}
              onClick={() => onTabChange(id)}
              data-tooltip={item.label}
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', id);
                setDragId(id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes('text/plain')) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (overId !== id) setOverId(id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const from = event.dataTransfer.getData('text/plain');
                if (isWorkspaceTab(from)) moveTab(from, id);
                setDragId(null);
                setOverId(null);
              }}
              onKeyDown={(event) => {
                if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
                event.preventDefault();
                const index = order.indexOf(id);
                const nextIndex = event.key === 'ArrowUp' ? index - 1 : index + 1;
                const neighbor = order[nextIndex];
                if (!neighbor) return;
                moveTab(id, neighbor);
              }}
            >
              <span className="workspace-nav__grip" aria-hidden="true" />
              <span className="ico" aria-hidden="true">{item.icon}</span>
              <span className="workspace-nav__label">{item.label}</span>
            </button>
          );
        })}
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
