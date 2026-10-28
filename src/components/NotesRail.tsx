import { useEffect, useState } from 'react';
import type { ManuscriptDocument } from '../core/document.ts';
import { emptyNotes, notesPanelPhase, type BookNotes, type CharacterNote } from '../core/notes.ts';
import { createIdFactory } from '../core/uid.ts';
import { bookSceneNotePlaces, noteAnchor } from '../core/wordGoal.ts';

export function NotesRail({
  doc,
  activeBlockId,
  saveError,
  collapsed = false,
  onToggleCollapsed,
  onChange,
  onShowBlock,
}: {
  doc: ManuscriptDocument;
  activeBlockId: string | null;
  saveError?: string | null;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onChange: (doc: ManuscriptDocument) => void;
  onShowBlock?: (blockId: string) => void;
}) {
  const [tab, setTab] = useState<'characters' | 'scene' | 'all'>('characters');
  const [readyId, setReadyId] = useState<string | null>(null);
  const ids = useState(() => createIdFactory('note'))[0];

  useEffect(() => {
    setReadyId(null);
    const frame = requestAnimationFrame(() => setReadyId(doc.manuscriptId));
    return () => cancelAnimationFrame(frame);
  }, [doc.manuscriptId]);

  const notes = doc.notes ?? emptyNotes();
  const unreadable = Boolean(doc.notes?.unreadable);
  const anchor = noteAnchor(doc.blocks, activeBlockId);
  const sceneNote = anchor ? notes.scenes.find((note) => note.blockId === anchor.blockId) ?? null : null;
  const places = bookSceneNotePlaces(doc.blocks, notes.scenes, activeBlockId);
  const sceneBodies = notes.scenes.filter((note) => note.body.trim()).length;
  const count = tab === 'characters'
    ? notes.characters.length
    : tab === 'scene'
      ? (sceneNote?.body.trim() ? 1 : 0)
      : notes.characters.length + sceneBodies;
  const phase = saveError ? 'error' : notesPanelPhase({ ready: readyId === doc.manuscriptId, unreadable, count });

  const write = (next: BookNotes) => {
    const cleaned = next.characters.length || next.scenes.length ? { characters: next.characters, scenes: next.scenes } : undefined;
    onChange({ ...doc, notes: cleaned });
  };

  const setSceneBody = (blockId: string, body: string) => {
    const scenes = notes.scenes.some((note) => note.blockId === blockId)
      ? notes.scenes.map((note) => (note.blockId === blockId ? { ...note, body } : note))
      : [...notes.scenes, { id: ids(), blockId, body }];
    write({
      ...notes,
      scenes: scenes.filter((note) => note.body.length > 0 || note.blockId === anchor?.blockId),
    });
  };

  const characters = (
    <>
      {notes.characters.length === 0 && (
        <p className="notes-rail__status">No character notes yet. Add someone who appears in this book. The note is saved with the book.</p>
      )}
      <ul className="notes-rail__list">
        {notes.characters.map((note) => (
          <li key={note.id}>
            <CharacterCard
              note={note}
              onChange={(next) => write({
                ...notes,
                characters: notes.characters.map((item) => (item.id === note.id ? next : item)),
              })}
              onRemove={() => write({ ...notes, characters: notes.characters.filter((item) => item.id !== note.id) })}
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="primary"
        onClick={() => write({
          ...notes,
          characters: [...notes.characters, { id: ids(), name: '', body: '' }],
        })}
      >
        Add a character
      </button>
    </>
  );

  return (
    <aside className={`notes-rail${collapsed ? ' is-collapsed' : ''}`} aria-label="Character and scene notes" data-notes-phase={phase}>
      <div className="notes-rail__head">
        <div className="notes-rail__title">
          <p className="eyebrow">Beside the page</p>
          <h2>Notes</h2>
        </div>
        {onToggleCollapsed && (
        <button
          type="button"
          className="notes-rail__toggle"
          aria-expanded={!collapsed}
          aria-controls="beside-the-page-notes"
          aria-label={collapsed ? 'Open notes' : 'Close notes'}
          data-tooltip={collapsed ? 'Open notes' : 'Close notes'}
          onClick={onToggleCollapsed}
        >
          {collapsed ? <span className="notes-rail__mark">Notes</span> : <span className="notes-rail__chevron" aria-hidden="true">›</span>}
        </button>
        )}
        <div className="notes-rail__tabs" role="tablist" aria-label="Notes">
          <button type="button" role="tab" aria-selected={tab === 'characters'} onClick={() => setTab('characters')}>
            Characters
          </button>
          <button type="button" role="tab" aria-selected={tab === 'scene'} onClick={() => setTab('scene')}>
            Scene
          </button>
          <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>
            All
          </button>
        </div>
      </div>
      <div id="beside-the-page-notes" className="notes-rail__panel" hidden={collapsed}>
      {phase === 'loading' && <p className="notes-rail__status">Opening notes…</p>}
      {phase === 'error' && (
        <div className="notes-rail__status notes-rail__status--error" role="alert">
          <p>{saveError || 'These notes could not be read.'}</p>
          {unreadable && !saveError && (
            <button type="button" onClick={() => onChange({ ...doc, notes: undefined })}>Start fresh notes</button>
          )}
        </div>
      )}
      {phase !== 'loading' && phase !== 'error' && tab === 'characters' && (
        <div className="notes-rail__body" role="tabpanel">
          {characters}
        </div>
      )}
      {phase !== 'loading' && phase !== 'error' && tab === 'scene' && (
        <div className="notes-rail__body" role="tabpanel">
          {!anchor && (
            <p className="notes-rail__status">Start a chapter, then keep a note for the scene you are writing. It is saved with the book.</p>
          )}
          {anchor && (
            <>
              <p className="notes-rail__anchor">{anchor.label}</p>
              {phase === 'empty' && (
                <p className="notes-rail__status">No scene note yet. Weather, purpose, what changes — whatever you need while the page is open.</p>
              )}
              {sceneBodies > (sceneNote?.body.trim() ? 1 : 0) && (
                <p className="notes-rail__status">
                  Other scenes in this book have notes.
                  {' '}
                  <button type="button" onClick={() => setTab('all')}>Show all notes</button>
                </p>
              )}
              <label className="notes-rail__field">
                <span className="sr-only">Scene note</span>
                <textarea
                  value={sceneNote?.body ?? ''}
                  placeholder="What happens in this scene…"
                  aria-label={`Scene note for ${anchor.label}`}
                  onChange={(event) => setSceneBody(anchor.blockId, event.target.value)}
                />
              </label>
            </>
          )}
        </div>
      )}
      {phase !== 'loading' && phase !== 'error' && tab === 'all' && (
        <div className="notes-rail__body" role="tabpanel" aria-label="All notes in this book">
          <p className="notes-rail__status">Every note saved with this book, including scenes that are not on this page.</p>
          {phase === 'empty' && (
            <p className="notes-rail__status">No notes in this book yet.</p>
          )}
          <h3 className="notes-rail__section">Characters</h3>
          {characters}
          <h3 className="notes-rail__section">Scenes</h3>
          {places.length === 0 && (
            <p className="notes-rail__status">No scene notes yet. Start a chapter, then write a note for the scene you are in.</p>
          )}
          <ul className="notes-rail__list">
            {places.map((place) => {
              const body = notes.scenes.find((note) => note.blockId === place.blockId)?.body ?? '';
              return (
                <li key={place.blockId} className={`notes-rail__scene${place.current ? ' is-current' : ''}`}>
                  <div className="notes-rail__place">
                    <p className="notes-rail__anchor">
                      {place.label}
                      {place.current ? ' · On this page' : ''}
                    </p>
                    {!place.missing && onShowBlock && (
                      <button
                        type="button"
                        className="notes-rail__show"
                        aria-label={`Show ${place.label} in the manuscript`}
                        onClick={() => onShowBlock(place.blockId)}
                      >
                        Show
                      </button>
                    )}
                    {place.missing && (
                      <button
                        type="button"
                        className="notes-rail__show"
                        aria-label="Remove this note"
                        onClick={() => write({ ...notes, scenes: notes.scenes.filter((note) => note.blockId !== place.blockId) })}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <label className="notes-rail__field">
                    <span className="sr-only">Scene note</span>
                    <textarea
                      value={body}
                      placeholder="What happens in this scene…"
                      aria-label={`Scene note for ${place.label}`}
                      onChange={(event) => setSceneBody(place.blockId, event.target.value)}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      </div>
    </aside>
  );
}

function CharacterCard({
  note,
  onChange,
  onRemove,
}: {
  note: CharacterNote;
  onChange: (note: CharacterNote) => void;
  onRemove: () => void;
}) {
  return (
    <div className="character-note">
      <label>
        <span className="sr-only">Character name</span>
        <input
          value={note.name}
          placeholder="Name"
          aria-label="Character name"
          onChange={(event) => onChange({ ...note, name: event.target.value })}
        />
      </label>
      <label>
        <span className="sr-only">Character note</span>
        <textarea
          value={note.body}
          placeholder="What you need beside the page"
          aria-label={note.name.trim() ? `Notes for ${note.name.trim()}` : 'Character note'}
          onChange={(event) => onChange({ ...note, body: event.target.value })}
        />
      </label>
      <button type="button" onClick={onRemove}>Remove</button>
    </div>
  );
}
