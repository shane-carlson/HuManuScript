import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  certificationExport,
  certificationSummary,
  chapterOrder,
  displayTitle,
  dragPreviewLabel,
  editField,
  insertStructure,
  manuscriptStats,
  movePassage,
  nudgeBlock,
  passageState,
  removeBlock,
  reorderBlocks,
  splitParagraph,
  mergeParagraphBackward,
  toggleFormat,
  type ManuscriptDocument,
} from '../core/document.ts';
import { findMatches, nearestValidDropIndex, validDropIndices } from '../core/manuscript.ts';
import type { InlineMarkKind } from '../core/types.ts';
import { createIdFactory } from '../core/uid.ts';
import { loadEditorView, saveEditorView, type EditorViewMode } from '../storage.ts';
import { ProvenanceField, type FieldCommit } from './ProvenanceField.tsx';

const BLOCK_MIME = 'application/x-humanuscript-block';

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function slug(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return base || 'untitled-manuscript';
}

export function Editor({
  doc,
  onChange,
}: {
  doc: ManuscriptDocument;
  onChange: (doc: ManuscriptDocument) => void;
}) {
  const ids = useRef(createIdFactory('hm'));
  const docRef = useRef(doc);
  const chain = useRef(Promise.resolve());
  const [undo, setUndo] = useState<ManuscriptDocument[]>([]);
  const [redo, setRedo] = useState<ManuscriptDocument[]>([]);
  const [query, setQuery] = useState('');
  const [hit, setHit] = useState(0);
  const [selection, setSelection] = useState<{ blockId: string; start: number; end: number } | null>(null);
  const [renderToken, setRenderToken] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<EditorViewMode>(() => loadEditorView());
  const textDrag = useRef<{ blockId: string; start: number; end: number } | null>(null);
  const canvasRef = useRef<HTMLElement>(null);

  useEffect(() => {
    saveEditorView(viewMode);
  }, [viewMode]);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  }, [undo, redo]);

  const replace = useCallback((next: ManuscriptDocument) => {
    docRef.current = next;
    setRenderToken((token) => token + 1);
    onChange(next);
  }, [onChange]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta || event.altKey || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      event.preventDefault();
      if (event.shiftKey) {
        const next = redoRef.current[0];
        if (!next) return;
        setRedo(redoRef.current.slice(1));
        setUndo([...undoRef.current, docRef.current]);
        replace(next);
        return;
      }
      const previous = undoRef.current[undoRef.current.length - 1];
      if (!previous) return;
      setUndo(undoRef.current.slice(0, -1));
      setRedo([docRef.current, ...redoRef.current]);
      replace(previous);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [replace]);

  const commit = (recipe: (current: ManuscriptDocument) => Promise<ManuscriptDocument> | ManuscriptDocument) => {
    const snapshot = docRef.current;
    chain.current = chain.current.then(async () => {
      try {
        const next = await recipe(docRef.current);
        if (next === docRef.current) return;
        docRef.current = next;
        setUndo((stack) => [...stack, snapshot].slice(-40));
        setRedo([]);
        onChange(next);
      } catch (error) {
        console.error(error);
      }
    });
  };

  const applyCommit = (blockId: string, field: 'title' | 'text', change: FieldCommit) => {
    commit((current) =>
      editField({
        doc: current,
        blockId,
        field,
        start: change.start,
        end: change.end,
        insert: change.insert,
        origin: change.origin,
        event: change.event,
        now: new Date().toISOString(),
        newId: ids.current,
      }),
    );
  };

  const matches = useMemo(() => findMatches(doc.blocks, query), [doc.blocks, query]);
  const activeHit = matches.length ? matches[hit % matches.length]! : null;
  const numbers = useMemo(() => new Map(chapterOrder(doc.blocks).map((c) => [c.id, c.number])), [doc.blocks]);
  const stats = manuscriptStats(doc.blocks);
  const seals = certificationSummary(doc);
  const name = slug(displayTitle(doc));

  useEffect(() => {
    if (!activeHit) return;
    document.getElementById(`block-${activeHit.blockId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeHit]);

  const onFormat = (kind: InlineMarkKind) => {
    if (!selection) return;
    commit((current) => toggleFormat(current, selection.blockId, selection, kind));
  };

  const showHighlights = viewMode === 'highlights';

  return (
    <div className="editor-grid">
      <aside className="rail">
        <p className="eyebrow">Manuscript</p>
        <h2>{displayTitle(doc)}</h2>
        <dl className="stats">
          <div>
            <dt>Words</dt>
            <dd>{stats.words}</dd>
          </div>
          <div>
            <dt>Certified</dt>
            <dd>{seals.certified}</dd>
          </div>
          <div>
            <dt>Uncertified</dt>
            <dd>{seals.uncertified}</dd>
          </div>
          <div>
            <dt>Chapters</dt>
            <dd>{stats.chapters}</dd>
          </div>
        </dl>
        {showHighlights && (
          <>
            <h3>How a passage got here</h3>
            <ul className="legend">
              <li><i className="swatch prov-keyboard" /> Keyboard, sealed</li>
              <li><i className="swatch prov-paste" /> Pasted, not sealed</li>
              <li><i className="swatch prov-drop" /> Dropped, not sealed</li>
              <li><i className="swatch prov-other" /> Other insertion, not sealed</li>
            </ul>
          </>
        )}
        <p className="trust">{doc.points.length === 0 ? 'Type to seal the first passage.' : `${doc.points.length} certification point${doc.points.length === 1 ? '' : 's'} on this manuscript.`}</p>
      </aside>

      <main className="canvas" ref={canvasRef}>
        <div className="toolbar" role="toolbar" aria-label="Manuscript tools">
          <button type="button" onClick={() => commit((current) => insertStructure(current, 'chapter', current.blocks.length, ids.current()))}>Chapter</button>
          <button type="button" onClick={() => commit((current) => insertStructure(current, 'scene', current.blocks.length, ids.current()))}>Scene</button>
          <button type="button" onClick={() => commit((current) => insertStructure(current, 'section', current.blocks.length, ids.current()))}>Section</button>
          <button type="button" onClick={() => commit((current) => insertStructure(current, 'paragraph', current.blocks.length, ids.current()))}>Paragraph</button>
          <span className="toolbar-gap" />
          <button type="button" aria-label="Bold" onClick={() => onFormat('bold')}><b>B</b></button>
          <button type="button" aria-label="Italic" onClick={() => onFormat('italic')}><i>I</i></button>
          <button type="button" aria-label="Underline" onClick={() => onFormat('underline')}><u>U</u></button>
          <span className="toolbar-gap" />
          <button type="button" onClick={() => { const previous = undo[undo.length - 1]; if (!previous) return; setUndo(undo.slice(0, -1)); setRedo([doc, ...redo]); replace(previous); }} disabled={!undo.length}>Undo</button>
          <button type="button" onClick={() => { const next = redo[0]; if (!next) return; setRedo(redo.slice(1)); setUndo([...undo, doc]); replace(next); }} disabled={!redo.length}>Redo</button>
          <span className="toolbar-gap" />
          <div className="view-toggle" role="group" aria-label="Editor view">
            <button
              type="button"
              className={viewMode === 'manuscript' ? 'is-active' : ''}
              aria-pressed={viewMode === 'manuscript'}
              onClick={() => setViewMode('manuscript')}
            >
              Manuscript
            </button>
            <button
              type="button"
              className={viewMode === 'highlights' ? 'is-active' : ''}
              aria-pressed={viewMode === 'highlights'}
              onClick={() => setViewMode('highlights')}
            >
              Certification
            </button>
          </div>
        </div>

        <form className="find" role="search" onSubmit={(e) => { e.preventDefault(); setHit((n) => n + 1); }}>
          <label htmlFor="find">Find</label>
          <input id="find" value={query} onChange={(e) => { setQuery(e.target.value); setHit(0); }} placeholder="Search the manuscript" />
          <span>{query.trim() ? `${matches.length ? (hit % matches.length) + 1 : 0} of ${matches.length}` : ' '}</span>
        </form>

        {doc.blocks.length === 0 ? (
          <div className="empty">
            <h2>The page is blank.</h2>
            <p>Start a chapter and write into it. Only letters that come from the keyboard are sealed. A paste from a chat window stays marked, and it is never certified.</p>
            <button type="button" className="primary" onClick={() => commit((current) => insertStructure(current, 'chapter', 0, ids.current()))}>Start a chapter</button>
          </div>
        ) : (
          <div className={`manuscript${dragging != null ? ' is-dragging' : ''}`}>
            {doc.blocks.map((block, index) => {
              const state = passageState(
                block.type === 'paragraph' ? doc.provenance[block.id]?.text ?? [] : doc.provenance[block.id]?.title ?? [],
                block.type === 'paragraph' ? block.text : block.title,
              );
              const highlight = activeHit && activeHit.blockId === block.id
                ? { start: activeHit.start, end: activeHit.end }
                : null;
              return (
                <div key={block.id}>
                  <div
                    className={`ms-insert-gap${dropAt === index ? ' is-hot' : ''}`}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(BLOCK_MIME) || dragging == null) return;
                      e.preventDefault();
                      const gaps = [...canvasRef.current!.querySelectorAll<HTMLElement>('[data-insert-index]')].map((el) => ({
                        index: Number(el.dataset.insertIndex),
                        y: el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2,
                      }));
                      const next = nearestValidDropIndex(e.clientY, gaps, validDropIndices(doc.blocks, dragging));
                      setDropAt(next);
                    }}
                    onDrop={(e) => {
                      if (dragging == null) return;
                      e.preventDefault();
                      const target = dropAt ?? index;
                      const from = dragging;
                      setDragging(null);
                      setDropAt(null);
                      commit((current) => reorderBlocks(current, from, target, new Date().toISOString(), ids.current()));
                    }}
                    data-insert-index={index}
                  />
                  <article id={`block-${block.id}`} className={`ms-block ms-${block.type}${dragging === index ? ' is-dragging' : ''}`}>
                    <div className="ms-gutter">
                      <span
                        className="ms-drag-handle"
                        draggable
                        role="button"
                        aria-label={`Drag ${dragPreviewLabel(block, numbers.get(block.id))}`}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(BLOCK_MIME, block.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragging(index);
                        }}
                        onDragEnd={() => { setDragging(null); setDropAt(null); }}
                      >
                        <span className="ms-drag-handle__dots" />
                      </span>
                      <button type="button" aria-label="Move up" onClick={() => commit((current) => nudgeBlock(current, block.id, -1, new Date().toISOString(), ids.current()))}>↑</button>
                      <button type="button" aria-label="Move down" onClick={() => commit((current) => nudgeBlock(current, block.id, 1, new Date().toISOString(), ids.current()))}>↓</button>
                    </div>
                    {block.type === 'chapter' && <span className="kicker">Chapter {numbers.get(block.id)}</span>}
                    {block.type === 'scene' && <span className="kicker">Scene</span>}
                    {block.type === 'section' && <span className="kicker">Section</span>}
                    <ProvenanceField
                      text={block.type === 'paragraph' ? block.text : block.title}
                      spans={block.type === 'paragraph' ? doc.provenance[block.id]?.text ?? [] : doc.provenance[block.id]?.title ?? []}
                      marks={block.type === 'paragraph' ? block.marks : []}
                      highlight={block.type === 'paragraph' || activeHit?.field === 'title' ? highlight : null}
                      placeholder={block.type === 'paragraph' ? 'Write the paragraph…' : block.type === 'chapter' ? 'Chapter title' : block.type === 'scene' ? 'Scene title' : 'Section title'}
                      className={block.type === 'paragraph' ? 'ms-para-editor' : 'ms-title-editor'}
                      ariaLabel={block.type === 'paragraph' ? 'Paragraph' : `${block.type} title`}
                      onCommit={(change) => applyCommit(block.id, block.type === 'paragraph' ? 'text' : 'title', change)}
                      onSplit={(offset) => commit((current) => splitParagraph({ doc: current, blockId: block.id, offset, now: new Date().toISOString(), newId: ids.current }))}
                      onMergeBackward={() => commit((current) => block.type === 'paragraph'
                        ? mergeParagraphBackward({ doc: current, blockId: block.id, now: new Date().toISOString(), newId: ids.current })
                        : current)}
                      onSelect={(start, end) => setSelection({ blockId: block.id, start, end })}
                      onFormat={onFormat}
                      onInternalDrag={(start, end) => {
                        textDrag.current = { blockId: block.id, start, end };
                      }}
                      renderToken={renderToken}
                      showProvenance={showHighlights}
                      onInternalDrop={(toOffset) => {
                        const source = textDrag.current;
                        textDrag.current = null;
                        if (!source) return;
                        commit((current) =>
                          movePassage({
                            doc: current,
                            fromId: source.blockId,
                            fromStart: source.start,
                            fromEnd: source.end,
                            toId: block.id,
                            toOffset,
                            now: new Date().toISOString(),
                            newId: ids.current,
                            moveId: ids.current(),
                          }),
                        );
                      }}
                    />
                    <div className="ms-meta">
                      {showHighlights && (
                        <span className={`pip pip-${state}`}>{state === 'empty' ? 'Empty' : state === 'certified' ? 'Certified' : state === 'mixed' ? 'Mixed' : 'Uncertified'}</span>
                      )}
                      <button type="button" onClick={() => commit((current) => removeBlock(current, block.id))}>{block.type === 'paragraph' ? 'Remove' : 'Remove heading'}</button>
                    </div>
                  </article>
                </div>
              );
            })}
            <div
              className={`ms-insert-gap${dropAt === doc.blocks.length ? ' is-hot' : ''}`}
              data-insert-index={doc.blocks.length}
              onDragOver={(e) => {
                if (dragging == null) return;
                e.preventDefault();
                if (validDropIndices(doc.blocks, dragging).includes(doc.blocks.length)) setDropAt(doc.blocks.length);
              }}
              onDrop={(e) => {
                if (dragging == null) return;
                e.preventDefault();
                const from = dragging;
                setDragging(null);
                setDropAt(null);
                commit((current) => reorderBlocks(current, from, current.blocks.length, new Date().toISOString(), ids.current()));
              }}
            />
          </div>
        )}
        <p className="canvas-note">Drag a handle to reorder a chapter with the prose under it, or move a paragraph. Moving text keeps a keyboard seal on that text. Dropping words in from another app does not.</p>
      </main>

      <aside className="points">
        <div className="points-head">
          <p className="eyebrow">Certification</p>
          <h2>Sealed passages</h2>
        </div>
        {doc.points.length === 0 ? (
          <p className="points-empty">Nothing is sealed yet. Keyboard text lands here with a content hash and the input events behind it. Pasted text never will.</p>
        ) : (
          <ol className="point-list">
            {doc.points.map((point) => (
              <li key={point.id}>
                <header>
                  <span>Certified</span>
                  <time dateTime={point.updatedAt}>{new Date(point.updatedAt).toLocaleString()}</time>
                </header>
                <blockquote>{point.text}</blockquote>
                <code title={point.contentHash}>{point.contentHash.slice(0, 16)}…</code>
                <p>{point.evidence.eventCount} observed input event{point.evidence.eventCount === 1 ? '' : 's'} · {point.evidence.inputTypes.join(', ') || 'keyboard'}</p>
                {point.lineage && <p className="lineage">{point.lineage}</p>}
              </li>
            ))}
          </ol>
        )}
        {doc.moves.length > 0 && (
          <div className="moves">
            <h3>Moves</h3>
            <ul>
              {doc.moves.slice(-6).reverse().map((move) => (
                <li key={move.id}>{move.label}</li>
              ))}
            </ul>
          </div>
        )}
        <button type="button" className="primary" onClick={() => downloadJson(`${name}.certification.json`, certificationExport(doc, new Date().toISOString()))}>Download certification record</button>
      </aside>
    </div>
  );
}
