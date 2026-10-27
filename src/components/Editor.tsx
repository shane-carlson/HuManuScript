import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AppVersionLabel } from './AppVersionLabel.tsx';
import {
  certificationExport,
  chapterOrder,
  clearBlockFormatting,
  combineParagraphs,
  deleteHeadingRange,
  deleteParagraphs,
  displayTitle,
  dragPreviewLabel,
  acceptGrammarSuggestion,
  editField,
  insertHeadingWithParagraph,
  insertStructure,
  setBlockKind,
  movePassage,
  replaceAllManuscriptMatches,
  replaceManuscriptMatch,
  nudgeBlock,
  passageState,
  removeBlock,
  reorderBlocks,
  splitParagraph,
  mergeParagraphBackward,
  toggleFormat,
  updateDividerBlock,
  updateImageBlock,
  updateParagraphMeta,
  updateTableRows,
  type ManuscriptDocument,
} from '../core/document.ts';
import { formatMixLabel, provenanceMix } from '../core/provenanceMix.ts';
import {
  dropPlaceLabel,
  findMatches,
  firstProseAfter,
  headingLabels,
  isHeadingType,
  matchIndexAtOrAfter,
  nearestValidDropIndex,
  paragraphRangeIds,
  validDropIndices,
  type StructureHeadingKind,
} from '../core/manuscript.ts';
import { createIdFactory } from '../core/uid.ts';
import { formatTypingDeviceLabel, getTypingDeviceLabel, shortPlatformLabel } from '../core/deviceName.ts';
import { GRAMMAR_CHECK_COMMENT } from '../core/certification.ts';
import { buildCertificationPageModel } from '../core/certificationPage.ts';
import {
  GRAMMAR_SCOPE_LABELS,
  blocksForGrammarScope,
  filterLintsToFields,
  grammarEditForSuggestion,
  shiftGrammarLints,
  type GrammarFieldRange,
  type GrammarLint,
  type GrammarScope,
  type GrammarSuggestionChoice,
} from '../core/grammar.ts';
import { harperEngineVersion, lintManuscriptBlocks, prepareHarper } from '../core/harperEngine.ts';
import { openPassageCards, scrollDelta } from '../core/passageCard.ts';
import {
  loadCertificationCollapsed,
  loadEditorView,
  loadNotesCollapsed,
  saveCertificationCollapsed,
  saveEditorView,
  saveNotesCollapsed,
  type EditorViewMode,
} from '../storage.ts';
import { applyWritingAids, readWritingAids, type WritingAids } from '../core/wordGoal.ts';
import { typewriterScrollDelta } from '../core/typewriter.ts';
import { isProseBlock, type BlockType, type InlineMarkKind } from '../core/types.ts';
import { CertificationMark } from './CertificationMark.tsx';
import { ManuscriptDivider, ManuscriptPageBreak } from './ManuscriptBreaks.tsx';
import { ManuscriptStatsBar } from './ManuscriptStatsBar.tsx';
import { NotesRail } from './NotesRail.tsx';
import { HeadingRemoveControl } from './HeadingRemoveControl.tsx';
import { ManuscriptImage } from './ManuscriptImage.tsx';
import { ManuscriptSelectBanner } from './ManuscriptSelectBanner.tsx';
import { ManuscriptTable } from './ManuscriptTable.tsx';
import { RawWriteView, type RawEdit } from './RawWriteView.tsx';
import { TableGridPicker } from './TableGridPicker.tsx';
import { FieldContextMenu, type ContextMenuState, type MenuAnchor } from './FieldContextMenu.tsx';
import {
  IconBlockQuote,
  IconBold,
  IconBulletList,
  IconCertificationView,
  IconChapter,
  IconExportPreview,
  IconFindNext,
  IconFindPrevious,
  IconImage,
  IconItalic,
  IconManuscriptView,
  IconNumberList,
  IconPageBreak,
  IconParagraph,
  IconRawWrite,
  IconRedo,
  IconReplace,
  IconReplaceAll,
  IconScene,
  IconSceneBreak,
  IconSection,
  IconStrikethrough,
  IconTable,
  IconUnderline,
  IconUndo,
  ToolbarIconButton,
} from './ManuscriptToolbarIcons.tsx';
import { GrammarMenu, GrammarResults } from './GrammarControls.tsx';
import { ProvenanceField, type FieldCommit } from './ProvenanceField.tsx';
import { ExportPreview } from './ExportPreview.tsx';
import { FontFamilyControl } from './FontFamilyControl.tsx';
import {
  MANUSCRIPT_FONT_SIZES,
  manuscriptTypographyStyle,
  resolveManuscriptTypography,
  setManuscriptTypography,
  subscribeExtraFaces,
} from '../core/typography.ts';
import { applyRawFormat, assignRawKind, clearRawFormat, flattenRaw, rawHighlightFields, rawKindAt, rawSegmentAt, replaceRawRange, type RawKind } from '../core/rawWrite.ts';

const BLOCK_MIME = 'application/x-humanuscript-block';
/** Full-screen view scale only. It does not change the book’s font size. */
const VIEW_ZOOM_MIN = 50;
const VIEW_ZOOM_MAX = 200;
const VIEW_ZOOM_STEP = 10;

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
  bookId,
  saveError = null,
  onChange,
  focusMode = false,
  onFocusModeChange,
  bookTitle,
  seriesLabel = null,
}: {
  doc: ManuscriptDocument;
  bookId: string;
  saveError?: string | null;
  onChange: (doc: ManuscriptDocument) => void;
  focusMode?: boolean;
  onFocusModeChange?: (focus: boolean) => void;
  bookTitle?: string;
  seriesLabel?: string | null;
}) {
  const ids = useRef(createIdFactory('hm'));
  const docRef = useRef(doc);
  const chain = useRef(Promise.resolve());
  const [undo, setUndo] = useState<ManuscriptDocument[]>([]);
  const [redo, setRedo] = useState<ManuscriptDocument[]>([]);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [replaceNote, setReplaceNote] = useState('');
  const [grammarLints, setGrammarLints] = useState<GrammarLint[]>([]);
  const [grammarNote, setGrammarNote] = useState('');
  const [grammarBusy, setGrammarBusy] = useState(false);
  const [hit, setHit] = useState(0);
  const [selection, setSelection] = useState<{ blockId: string; start: number; end: number } | null>(null);
  const [renderToken, setRenderToken] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [tablePicker, setTablePicker] = useState<{ x: number; y: number; at: number } | null>(null);
  const [gapMenu, setGapMenu] = useState<(ContextMenuState & { atIndex: number }) | null>(null);
  const gapAnchorRef = useRef<MenuAnchor | null>(null);
  const lastSelectedRef = useRef<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<EditorViewMode>(() => loadEditorView());
  const [rawRange, setRawRange] = useState<{ start: number; end: number } | null>(null);
  const [certCollapsed, setCertCollapsed] = useState(() => loadCertificationCollapsed());
  const [notesCollapsed, setNotesCollapsed] = useState(() => loadNotesCollapsed());
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [linkedCardId, setLinkedCardId] = useState<string | null>(null);
  const [liveDevice, setLiveDevice] = useState<string | null>(() => shortPlatformLabel());
  const [viewPercent, setViewPercent] = useState(100);
  const [caretRequest, setCaretRequest] = useState<{ blockId: string; offset: number; nonce: number } | null>(null);
  const caretNonce = useRef(0);
  const aidsRef = useRef<WritingAids>(readWritingAids(doc));
  const [trackedFocus, setTrackedFocus] = useState(focusMode);
  if (focusMode !== trackedFocus) {
    setTrackedFocus(focusMode);
    if (!focusMode) setViewPercent(100);
  }
  const pointListRef = useRef<HTMLOListElement>(null);
  const textDrag = useRef<{ blockId: string; start: number; end: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveEditorView(viewMode);
  }, [viewMode]);

  useEffect(() => {
    saveCertificationCollapsed(certCollapsed);
  }, [certCollapsed]);

  useEffect(() => {
    saveNotesCollapsed(notesCollapsed);
  }, [notesCollapsed]);

  useEffect(() => {
    let cancel = false;
    void getTypingDeviceLabel().then((label) => {
      if (!cancel) setLiveDevice(label);
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    docRef.current = doc;
    aidsRef.current = readWritingAids(doc);
  }, [doc]);

  const requestCaret = (blockId: string, offset: number) => {
    caretNonce.current += 1;
    setCaretRequest({ blockId, offset, nonce: caretNonce.current });
  };

  const publish = (next: ManuscriptDocument) => {
    docRef.current = next;
    aidsRef.current = readWritingAids(next);
    onChange(next);
  };

  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  }, [undo, redo]);

  const replace = useCallback((next: ManuscriptDocument) => {
    const withAids = applyWritingAids(next, aidsRef.current);
    docRef.current = withAids;
    aidsRef.current = readWritingAids(withAids);
    setRenderToken((token) => token + 1);
    onChange(withAids);
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

  useEffect(() => {
    if (!replaceOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setReplaceOpen(false);
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('.find')) active.blur();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [replaceOpen]);

  useEffect(() => {
    if (!focusMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      event.preventDefault();
      onFocusModeChange?.(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [focusMode, onFocusModeChange]);

  useEffect(() => {
    if (!focusMode) return;
    const scroller = canvasRef.current;
    if (!scroller) return;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const node = sel.anchorNode;
        if (!node || !scroller.contains(node)) return;
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(false);
        const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
        if (rect.height === 0 && rect.width === 0) return;
        const bounds = scroller.getBoundingClientRect();
        const delta = typewriterScrollDelta({
          caretTop: rect.top,
          caretBottom: rect.bottom || rect.top + 1,
          viewTop: bounds.top,
          viewBottom: bounds.bottom,
        });
        if (Math.abs(delta) < 8) return;
        scroller.scrollTop += delta;
      });
    };
    document.addEventListener('selectionchange', follow);
    window.addEventListener('resize', follow);
    follow();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', follow);
      window.removeEventListener('resize', follow);
    };
  }, [focusMode, viewPercent, doc, renderToken]);

  const commit = (
    recipe: (current: ManuscriptDocument) => Promise<ManuscriptDocument> | ManuscriptDocument,
    options?: { external?: boolean },
  ) => {
    const snapshot = docRef.current;
    chain.current = chain.current.then(async () => {
      try {
        const next = await recipe(docRef.current);
        if (next === docRef.current) return;
        const withAids = applyWritingAids(next, aidsRef.current);
        docRef.current = withAids;
        aidsRef.current = readWritingAids(withAids);
        setUndo((stack) => [...stack, snapshot].slice(-40));
        setRedo([]);
        if (options?.external) setRenderToken((token) => token + 1);
        onChange(withAids);
      } catch (error) {
        console.error(error);
      }
    });
  };

  const openChapter = (index: number) => {
    const headingId = ids.current();
    const paragraphId = ids.current();
    requestCaret(paragraphId, 0);
    commit((current) => insertHeadingWithParagraph(current, 'chapter', index, headingId, paragraphId));
  };

  const focusProseAt = (clientY: number) => {
    const current = docRef.current;
    const root = canvasRef.current;
    if (!root) return;
    const articles = [...root.querySelectorAll<HTMLElement>('article.ms-block')];
    let headingIndex = -1;
    for (const article of articles) {
      const id = article.id.slice('block-'.length);
      const index = current.blocks.findIndex((block) => block.id === id);
      const block = current.blocks[index];
      if (!block || index < 0) continue;
      const rect = article.getBoundingClientRect();
      const heading = block.type === 'chapter' || block.type === 'scene' || block.type === 'section';
      if (clientY >= rect.top && clientY <= rect.bottom) {
        if (isProseBlock(block.type)) {
          requestCaret(block.id, block.text.length);
          return;
        }
        if (heading) headingIndex = index;
      } else if (rect.bottom <= clientY && heading) {
        headingIndex = index;
      }
    }
    const target = firstProseAfter(current.blocks, headingIndex);
    if ('id' in target) {
      const block = current.blocks.find((item) => item.id === target.id);
      requestCaret(target.id, block && isProseBlock(block.type) ? block.text.length : 0);
      return;
    }
    const paragraphId = ids.current();
    requestCaret(paragraphId, 0);
    commit((live) => insertStructure(live, 'paragraph', target.insertAt, paragraphId));
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
        pasteHint: change.pasteHint,
        event: change.event,
        now: new Date().toISOString(),
        newId: ids.current,
      }),
    );
  };

  const matches = useMemo(() => findMatches(doc.blocks, query), [doc.blocks, query]);
  const activeIndex = matches.length ? ((hit % matches.length) + matches.length) % matches.length : 0;
  const activeHit = matches.length ? matches[activeIndex]! : null;
  const numbers = useMemo(() => new Map(chapterOrder(doc.blocks).map((c) => [c.id, c.number])), [doc.blocks]);
  const name = slug(displayTitle(doc));

  useEffect(() => {
    if (!activeHit) return;
    document.getElementById(`block-${activeHit.blockId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeHit]);

  const stepMatch = (delta: number) => {
    if (!matches.length) return;
    setHit((n) => {
      const current = ((n % matches.length) + matches.length) % matches.length;
      return (current + delta + matches.length) % matches.length;
    });
  };

  const replaceCurrent = () => {
    if (!matches.length || !query.trim()) return;
    const current = matches[activeIndex]!;
    const queryNow = query;
    const replacementNow = replacement;
    commit(async (currentDoc) => {
      const live = findMatches(currentDoc.blocks, queryNow);
      const match = live.find(
        (item) =>
          item.blockId === current.blockId &&
          item.field === current.field &&
          item.start === current.start &&
          item.end === current.end,
      );
      if (!match) return currentDoc;
      const next = await replaceManuscriptMatch({
        doc: currentDoc,
        match,
        replacement: replacementNow,
        now: new Date().toISOString(),
        newId: ids.current,
      });
      if (next === currentDoc) return currentDoc;
      const nextMatches = findMatches(next.blocks, queryNow);
      const idx = matchIndexAtOrAfter(next.blocks, nextMatches, {
        blockId: match.blockId,
        field: match.field,
        at: match.start + replacementNow.length,
      });
      setHit(idx >= 0 ? idx : 0);
      setReplaceNote('Replaced 1');
      return next;
    }, { external: true });
  };

  const replaceEvery = () => {
    if (!query.trim()) return;
    const queryNow = query;
    const replacementNow = replacement;
    commit(async (currentDoc) => {
      const result = await replaceAllManuscriptMatches({
        doc: currentDoc,
        query: queryNow,
        replacement: replacementNow,
        now: new Date().toISOString(),
        newId: ids.current,
      });
      if (result.doc === currentDoc) return currentDoc;
      setHit(0);
      setReplaceNote(result.count === 1 ? 'Replaced 1' : `Replaced ${result.count}`);
      return result.doc;
    }, { external: true });
  };

  const editRaw = (edit: RawEdit) => {
    commit((current) => replaceRawRange({
      doc: current,
      start: edit.start,
      end: edit.end,
      insert: edit.insert,
      origin: edit.origin,
      event: edit.origin
        ? { at: new Date().toISOString(), inputType: edit.inputType, data: edit.insert.slice(0, 200), trusted: true }
        : null,
      now: new Date().toISOString(),
      newId: ids.current,
    }));
  };

  const assignHighlighted = (kind: RawKind) => {
    if (!rawRange || rawRange.end <= rawRange.start) return;
    const range = rawRange;
    commit((current) => assignRawKind({
      doc: current,
      start: range.start,
      end: range.end,
      kind,
      now: new Date().toISOString(),
      newId: ids.current,
    }));
  };

  const onFormat = (kind: InlineMarkKind) => {
    if (viewMode === 'raw') {
      if (!rawRange) return;
      const range = rawRange;
      commit((current) => applyRawFormat(current, range.start, range.end, kind));
      return;
    }
    if (!selection) return;
    commit((current) => toggleFormat(current, selection.blockId, selection, kind));
  };

  const onClearFormat = () => {
    if (viewMode === 'raw') {
      if (!rawRange || rawRange.end <= rawRange.start) return;
      const range = rawRange;
      commit((current) => clearRawFormat(current, range.start, range.end));
      return;
    }
    if (!selection) return;
    commit((current) => clearBlockFormatting(current, selection.blockId, selection));
  };

  const paragraphIds = doc.blocks.filter((block) => block.type === 'paragraph').map((block) => block.id);
  const selectedCount = paragraphIds.filter((id) => selectedIds.has(id)).length;
  const toggleParagraph = (id: string) => {
    lastSelectedRef.current = id;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectParagraphRange = (id: string) => {
    const ids = paragraphRangeIds(paragraphIds, lastSelectedRef.current, id);
    lastSelectedRef.current = id;
    setSelectedIds(new Set(ids));
  };

  const openTablePicker = (x: number, y: number, at: number) => {
    setTablePicker({ x, y, at });
  };

  const focusedBlock = selection ? doc.blocks.find((block) => block.id === selection.blockId) : undefined;
  const kindEnabled = Boolean(
    focusedBlock && focusedBlock.type !== 'image' && focusedBlock.type !== 'table',
  );
  const headingValue: StructureHeadingKind | null =
    focusedBlock?.type === 'chapter' || focusedBlock?.type === 'scene' || focusedBlock?.type === 'section'
      ? focusedBlock.type
      : focusedBlock?.type === 'paragraph'
        ? 'paragraph'
        : null;
  const clearEnabled = Boolean(focusedBlock && isProseBlock(focusedBlock.type));

  const applyKind = (kind: StructureHeadingKind) => {
    if (!focusedBlock || !kindEnabled) return;
    commit((current) => setBlockKind(current, focusedBlock.id, kind));
  };

  const insertAfter = (afterBlockId: string, kind: BlockType) => {
    commit((current) => {
      const index = current.blocks.findIndex((b) => b.id === afterBlockId);
      if (index < 0) return current;
      return insertStructure(current, kind, index + 1, ids.current());
    });
  };

  const insertAfterIndex = (index: number, kind: BlockType) => {
    commit((current) => insertStructure(current, kind, index, ids.current()));
  };

  useEffect(() => {
    void prepareHarper();
  }, []);

  const grammarAnchor = (anchorId?: string) => {
    if (anchorId) return anchorId;
    const current = docRef.current;
    if (viewMode === 'raw' && rawRange) {
      return rawSegmentAt(flattenRaw(current), rawRange.start)?.blockId ?? null;
    }
    return selection?.blockId ?? current.blocks[0]?.id ?? null;
  };

  const runGrammar = (blocks: ManuscriptDocument['blocks'], ranges: GrammarFieldRange[] | null, emptyNote: string) => {
    setGrammarBusy(true);
    setGrammarNote('');
    void lintManuscriptBlocks(blocks)
      .then((found) => {
        const kept = ranges ? filterLintsToFields(found, ranges) : found;
        setGrammarLints(kept);
        setGrammarNote(kept.length ? '' : emptyNote);
      })
      .catch((error: unknown) => {
        setGrammarLints([]);
        setGrammarNote(error instanceof Error ? error.message : 'Grammar check failed.');
      })
      .finally(() => setGrammarBusy(false));
  };

  const checkGrammar = (scope: GrammarScope, anchorId?: string) => {
    const current = docRef.current;
    const anchor = grammarAnchor(anchorId);
    if (scope === 'block' && !anchor) {
      setGrammarLints([]);
      setGrammarNote('There is no paragraph to check yet.');
      return;
    }
    const blocks = blocksForGrammarScope(current.blocks, anchor, scope);
    runGrammar(blocks, null, `No grammar issues in ${GRAMMAR_SCOPE_LABELS[scope].toLowerCase()}.`);
  };

  const checkHighlighted = () => {
    const current = docRef.current;
    const ranges: GrammarFieldRange[] = viewMode === 'raw'
      ? rawRange && rawRange.end > rawRange.start
        ? rawHighlightFields(current, rawRange.start, rawRange.end)
        : []
      : selection && selection.end > selection.start
        ? (() => {
            const block = current.blocks.find((item) => item.id === selection.blockId);
            if (!block) return [];
            const field = isProseBlock(block.type) ? 'text' as const : 'title' as const;
            return [{ blockId: block.id, field, start: selection.start, end: selection.end }];
          })()
        : [];
    if (!ranges.length) {
      setGrammarLints([]);
      setGrammarNote('Highlight the text to check, or choose a paragraph or the whole manuscript.');
      return;
    }
    const ids = new Set(ranges.map((range) => range.blockId));
    runGrammar(
      current.blocks.filter((block) => ids.has(block.id)),
      ranges,
      'No grammar issues in the highlighted text.',
    );
  };

  const acceptGrammar = (lint: GrammarLint, suggestion: GrammarSuggestionChoice) => {
    const edit = grammarEditForSuggestion(lint, suggestion);
    commit(async (current) => {
      const block = current.blocks.find((item) => item.id === lint.blockId);
      if (!block) return current;
      const text = lint.field === 'text' ? block.text : block.title;
      if (text.slice(lint.start, lint.end) !== lint.problem) return current;
      return acceptGrammarSuggestion({
        doc: current,
        blockId: lint.blockId,
        field: lint.field,
        start: edit.start,
        end: edit.end,
        insert: edit.insert,
        suggestion: suggestion.kind,
        lintKind: lint.lintKind,
        message: lint.message,
        dialect: 'American',
        engineVersion: harperEngineVersion(),
        now: new Date().toISOString(),
        newId: ids.current,
      });
    }, { external: true });
    setGrammarLints((current) => shiftGrammarLints(current, lint, edit.insert.length));
  };

  const insertNear = (kind: BlockType) => {
    commit((current) => {
      const index = selection
        ? current.blocks.findIndex((b) => b.id === selection.blockId)
        : current.blocks.length - 1;
      const at = index >= 0 ? index + 1 : 0;
      return insertStructure(current, kind, at, ids.current());
    });
  };

  const showHighlights = viewMode === 'highlights';
  const showPreview = viewMode === 'preview';
  const noteBlockId = viewMode === 'raw'
    ? (rawRange ? rawSegmentAt(flattenRaw(doc), rawRange.start)?.blockId ?? null : null)
    : (selection?.blockId ?? null);
  const certHashes = useMemo(() => {
    const hashes: Record<string, string> = {};
    for (const point of doc.points) hashes[point.id] = point.contentHash;
    return hashes;
  }, [doc.points]);
  const grammarSeals = useMemo(() => {
    const seals: Record<string, string> = {};
    for (const point of doc.points) {
      if (point.grammar?.used) seals[point.id] = point.grammar.comment;
    }
    return seals;
  }, [doc.points]);
  const [fontEpoch, setFontEpoch] = useState(0);
  useEffect(() => subscribeExtraFaces(() => setFontEpoch((epoch) => epoch + 1)), []);
  const typography = useMemo(() => resolveManuscriptTypography(doc), [doc, fontEpoch]);
  const manuscriptStyle = manuscriptTypographyStyle(doc) as CSSProperties;
  const showReplace = replaceOpen && !showPreview;
  const openCards = useMemo(
    () => (showHighlights ? openPassageCards(doc) : []),
    [doc, showHighlights],
  );
  if (!showHighlights && linkedCardId !== null) setLinkedCardId(null);

  useLayoutEffect(() => {
    if (!showHighlights || !linkedCardId) return;
    const card = pointListRef.current?.querySelector<HTMLElement>(
      `[data-card-id="${CSS.escape(linkedCardId)}"]`,
    );
    const hash = card?.querySelector<HTMLElement>('[data-sha256]');
    if (hash) scrollCardIntoCertificationPane(hash);
    else if (card) scrollCardIntoCertificationPane(card);
  }, [showHighlights, linkedCardId, doc.points.length, openCards.length]);
  const [previewExportedAt, setPreviewExportedAt] = useState(() => new Date().toISOString());
  const previewModel = useMemo(
    () => buildCertificationPageModel(doc, previewExportedAt, {
      bookTitle: bookTitle || displayTitle(doc),
      seriesLabel,
    }, liveDevice),
    [doc, previewExportedAt, bookTitle, seriesLabel, liveDevice],
  );
  const openPreview = () => {
    setPreviewExportedAt(new Date().toISOString());
    setViewMode('preview');
  };

  return (
    <>
    <ManuscriptStatsBar
      doc={doc}
      bookId={bookId}
      compact={focusMode}
      activeBlockId={selection?.blockId ?? null}
      saveError={saveError}
      onChange={publish}
    />
    <div
      className={`editor-layout${focusMode ? ' is-focus' : ' has-notes'}${certCollapsed ? ' is-cert-collapsed' : ''}${notesCollapsed ? ' is-notes-collapsed' : ''}`}
    >
      {focusMode && (
        <div className="focus-exit-bar">
          <p>Full screen — writing only</p>
          <AppVersionLabel className="app-version app-version--focus" />
          <div className="focus-zoom" role="group" aria-label="Page zoom">
            <button
              type="button"
              data-tooltip="Zoom out"
              aria-label="Zoom out"
              disabled={viewPercent <= VIEW_ZOOM_MIN}
              onClick={() => setViewPercent((current) => Math.max(VIEW_ZOOM_MIN, current - VIEW_ZOOM_STEP))}
            >
              −
            </button>
            <span className="focus-zoom__level" aria-live="polite">{viewPercent}%</span>
            <button
              type="button"
              data-tooltip="Zoom in"
              aria-label="Zoom in"
              disabled={viewPercent >= VIEW_ZOOM_MAX}
              onClick={() => setViewPercent((current) => Math.min(VIEW_ZOOM_MAX, current + VIEW_ZOOM_STEP))}
            >
              +
            </button>
            <button
              type="button"
              data-tooltip="Back to 100%"
              aria-label="Back to 100%"
              disabled={viewPercent === 100}
              onClick={() => setViewPercent(100)}
            >
              100%
            </button>
          </div>
          <button type="button" className="primary" onClick={() => onFocusModeChange?.(false)}>
            Exit full screen
          </button>
          <span className="focus-hint">Esc</span>
        </div>
      )}
      <main className={`canvas manuscript-surface${showPreview ? ' is-preview' : ''}`}>
        <div className={`canvas-head${showReplace ? ' is-replace-open' : ''}`}>
        <div
          className="toolbar"
          role="toolbar"
          aria-label="Manuscript tools"
          onMouseDown={(event) => {
            const target = event.target;
            if (!(target instanceof Element) || target.closest('input, textarea, select, option')) return;
            event.preventDefault();
          }}
        >
          <div className="toolbar-group">
            <span className="toolbar-group__label" id="toolbar-structure">Structure</span>
            <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-structure">
              {viewMode === 'raw' ? (
                ([
                  ['chapter', 'Chapter'],
                  ['scene', 'Scene'],
                  ['section', 'Section'],
                  ['paragraph', 'Paragraph'],
                  ['blockquote', 'Block quote'],
                ] as const).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    className={`toolbar-text-btn${rawRange && rawKindAt(doc, rawRange.start, rawRange.end) === kind ? ' is-active' : ''}`}
                    disabled={!rawRange || rawRange.end <= rawRange.start}
                    onClick={() => assignHighlighted(kind)}
                  >
                    {label}
                  </button>
                ))
              ) : (
                <>
              <ToolbarIconButton label="Chapter" onClick={() => openChapter(docRef.current.blocks.length)}>
                <IconChapter />
              </ToolbarIconButton>
              <ToolbarIconButton label="Scene" onClick={() => commit((current) => insertStructure(current, 'scene', current.blocks.length, ids.current()))}>
                <IconScene />
              </ToolbarIconButton>
              <ToolbarIconButton label="Section" onClick={() => commit((current) => insertStructure(current, 'section', current.blocks.length, ids.current()))}>
                <IconSection />
              </ToolbarIconButton>
              <ToolbarIconButton label="Paragraph" onClick={() => commit((current) => insertStructure(current, 'paragraph', current.blocks.length, ids.current()))}>
                <IconParagraph />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="Table"
                onClick={(event) => {
                  const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  openTablePicker(rect.left, rect.bottom + 4, docRef.current.blocks.length);
                }}
              >
                <IconTable />
              </ToolbarIconButton>
              <ToolbarIconButton label="Image" onClick={() => commit((current) => insertStructure(current, 'image', current.blocks.length, ids.current()))}>
                <IconImage />
              </ToolbarIconButton>
                </>
              )}
            </div>
          </div>
          <div className="toolbar-group">
            <span className="toolbar-group__label" id="toolbar-breaks">Breaks</span>
            <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-breaks">
              <ToolbarIconButton label="Page break" onClick={() => insertNear('pageBreak')}>
                <IconPageBreak />
              </ToolbarIconButton>
              <ToolbarIconButton label="Scene break" onClick={() => insertNear('divider')}>
                <IconSceneBreak />
              </ToolbarIconButton>
            </div>
          </div>
          <div className="toolbar-group">
            <span className="toolbar-group__label" id="toolbar-formatting">Formatting</span>
            <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-formatting">
              <ToolbarIconButton label="Bold" onClick={() => onFormat('bold')}>
                <IconBold />
              </ToolbarIconButton>
              <ToolbarIconButton label="Italic" onClick={() => onFormat('italic')}>
                <IconItalic />
              </ToolbarIconButton>
              <ToolbarIconButton label="Underline" onClick={() => onFormat('underline')}>
                <IconUnderline />
              </ToolbarIconButton>
              <ToolbarIconButton label="Strikethrough" onClick={() => onFormat('strike')}>
                <IconStrikethrough />
              </ToolbarIconButton>
              <button type="button" className="toolbar-text-btn" disabled={viewMode === 'raw' ? !rawRange || rawRange.end <= rawRange.start : !clearEnabled} onClick={onClearFormat}>
                Clear format
              </button>
              {viewMode !== 'raw' && (
                <ToolbarIconButton label="Block quote" onClick={() => insertNear('blockquote')}>
                  <IconBlockQuote />
                </ToolbarIconButton>
              )}
              <FontFamilyControl
                fontId={typography.font.id}
                onChange={(fontFamily) => {
                  commit((current) => setManuscriptTypography(current, { fontFamily }));
                }}
              />
              <label className="toolbar-font toolbar-font--size" data-tooltip="Font size">
                <select
                  aria-label="Font size"
                  value={String(typography.sizePt)}
                  onChange={(event) => {
                    const fontSize = Number(event.target.value);
                    commit((current) => setManuscriptTypography(current, { fontSize }));
                  }}
                >
                  {MANUSCRIPT_FONT_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size} pt
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {viewMode !== 'raw' && (
          <div className="toolbar-group">
            <span className="toolbar-group__label" id="toolbar-heading">Heading</span>
            <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-heading">
              {([
                ['chapter', 'Chapter'],
                ['scene', 'Scene'],
                ['section', 'Section'],
                ['paragraph', 'Body'],
              ] as const).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  className={`toolbar-text-btn${headingValue === kind ? ' is-active' : ''}`}
                  disabled={!kindEnabled}
                  aria-pressed={headingValue === kind}
                  onClick={() => applyKind(kind)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          )}
          <div className="toolbar-group">
            <span className="toolbar-group__label" id="toolbar-arrange">Arrange</span>
            <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-arrange">
              <button
                type="button"
                className={`toolbar-text-btn${selecting ? ' is-active' : ''}`}
                aria-pressed={selecting}
                title="Use this to select paragraphs to combine or delete"
                onClick={() => {
                  setSelecting((value) => {
                    if (value) setSelectedIds(new Set());
                    return !value;
                  });
                }}
              >
                Select paragraphs
              </button>
            </div>
          </div>
          <div className="toolbar-group">
            <span className="toolbar-group__label" id="toolbar-grammar">Grammar</span>
            <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-grammar">
              <GrammarMenu
                disabled={showPreview}
                busy={grammarBusy}
                hasSelection={viewMode === 'raw' ? Boolean(rawRange && rawRange.end > rawRange.start) : Boolean(selection && selection.end > selection.start)}
                onCheckSelection={checkHighlighted}
                onCheckScope={checkGrammar}
              />
            </div>
          </div>
          <div className="toolbar-group">
            <span className="toolbar-group__label" id="toolbar-lists">Lists</span>
            <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-lists">
              <ToolbarIconButton
                label="Bullet list"
                disabled={!selection}
                onClick={() => {
                  if (!selection) return;
                  commit((c) => updateParagraphMeta(c, selection.blockId, { listStyle: 'bullet' }));
                }}
              >
                <IconBulletList />
              </ToolbarIconButton>
              <ToolbarIconButton
                label="Numbered list"
                disabled={!selection}
                onClick={() => {
                  if (!selection) return;
                  commit((c) => updateParagraphMeta(c, selection.blockId, { listStyle: 'number' }));
                }}
              >
                <IconNumberList />
              </ToolbarIconButton>
            </div>
          </div>
          <div className="toolbar-history-find">
            <div className="toolbar-group">
              <span className="toolbar-group__label" id="toolbar-history">History</span>
              <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-history">
                <ToolbarIconButton
                  label="Undo"
                  disabled={!undo.length}
                  onClick={() => {
                    const previous = undo[undo.length - 1];
                    if (!previous) return;
                    setUndo(undo.slice(0, -1));
                    setRedo([doc, ...redo]);
                    replace(previous);
                  }}
                >
                  <IconUndo />
                </ToolbarIconButton>
                <ToolbarIconButton
                  label="Redo"
                  disabled={!redo.length}
                  onClick={() => {
                    const next = redo[0];
                    if (!next) return;
                    setRedo(redo.slice(1));
                    setUndo([...undo, doc]);
                    replace(next);
                  }}
                >
                  <IconRedo />
                </ToolbarIconButton>
              </div>
            </div>
            {!showPreview && (
              <div
                className="find"
                role="search"
                data-replace-open={showReplace ? 'true' : 'false'}
                aria-label={showReplace ? 'Find and replace' : 'Find'}
                onBlur={(event) => {
                  const next = event.relatedTarget;
                  if (next instanceof Node && event.currentTarget.contains(next)) return;
                  setReplaceOpen(false);
                }}
              >
                <label className="toolbar-group__label" htmlFor="find" data-find-label={showReplace ? 'FIND & REPLACE' : 'FIND'}>
                  {showReplace ? 'FIND & REPLACE' : 'FIND'}
                </label>
                <div className="find-row">
                  <div className="find-field">
                    <input
                      id="find"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setHit(0);
                        setReplaceNote('');
                      }}
                      onFocus={() => setReplaceOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        stepMatch(e.shiftKey ? -1 : 1);
                      }}
                      placeholder="Search the manuscript"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <div className="find-actions" role="group" aria-label="Find in the manuscript">
                      <ToolbarIconButton label="Find previous" disabled={!matches.length} onClick={() => stepMatch(-1)}>
                        <IconFindPrevious />
                      </ToolbarIconButton>
                      <ToolbarIconButton label="Find next" disabled={!matches.length} onClick={() => stepMatch(1)}>
                        <IconFindNext />
                      </ToolbarIconButton>
                    </div>
                    {showReplace && (
                      <div className="find-row find-row--replace">
                        <div className="find-field">
                          <input
                            id="replace"
                            aria-label="Replace"
                            value={replacement}
                            onChange={(e) => setReplacement(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              e.preventDefault();
                              replaceCurrent();
                            }}
                            placeholder="Replacement"
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <div className="find-actions" role="group" aria-label="Replace in the manuscript">
                            <ToolbarIconButton label="Replace" disabled={!matches.length} onClick={replaceCurrent}>
                              <IconReplace />
                            </ToolbarIconButton>
                            <ToolbarIconButton label="Replace all" disabled={!matches.length} onClick={replaceEvery}>
                              <IconReplaceAll />
                            </ToolbarIconButton>
                          </div>
                        </div>
                        {replaceNote ? <span className="find-count">{replaceNote}</span> : null}
                      </div>
                    )}
                  </div>
                  {query.trim() ? (
                    <span className="find-count" aria-live="polite">
                      {matches.length ? activeIndex + 1 : 0} of {matches.length}
                    </span>
                  ) : null}
                </div>
              </div>
            )}
          </div>
          <div className="toolbar-group toolbar-group--end">
            <span className="toolbar-group__label" id="toolbar-view">View</span>
            <div className="toolbar-group__icons" role="group" aria-labelledby="toolbar-view">
              <div className="view-toggle" role="group" aria-label="Editor view">
                <ToolbarIconButton
                  label="Raw write"
                  active={viewMode === 'raw'}
                  onClick={() => setViewMode('raw')}
                >
                  <IconRawWrite />
                </ToolbarIconButton>
                <ToolbarIconButton
                  label="Manuscript view"
                  active={viewMode === 'manuscript'}
                  onClick={() => setViewMode('manuscript')}
                >
                  <IconManuscriptView />
                </ToolbarIconButton>
                <ToolbarIconButton
                  label="Certification highlights"
                  active={viewMode === 'highlights'}
                  onClick={() => setViewMode('highlights')}
                >
                  <IconCertificationView />
                </ToolbarIconButton>
                <ToolbarIconButton
                  label="Export preview"
                  active={viewMode === 'preview'}
                  onClick={openPreview}
                >
                  <IconExportPreview />
                </ToolbarIconButton>
              </div>
              {!focusMode ? (
                <button type="button" className="focus-enter" data-tooltip="Full screen" aria-label="Full screen" onClick={() => onFocusModeChange?.(true)}>
                  Full screen
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {viewMode === 'raw' && (
          <p className="raw-write-hint">Type on the blank page. Highlight a passage, then choose chapter, section, paragraph, block quote, or a format above.</p>
        )}
        {showHighlights && (
          <ul className="legend legend--inline" aria-label="Passage origins">
            <li><i className="swatch prov-keyboard" /> Keyboard, sealed</li>
            <li><i className="swatch prov-dictation" /> Dictation, sealed</li>
            <li><i className="swatch prov-paste" /> Pasted, not sealed</li>
            <li><i className="swatch prov-drop" /> Dropped, not sealed</li>
            <li><i className="swatch prov-other" /> Other insertion, not sealed</li>
            <li><i className="swatch prov-grammar" /> Grammar checked, still sealed</li>
          </ul>
        )}
        {!showPreview && (
          <GrammarResults
            doc={doc}
            lints={grammarLints}
            note={grammarNote}
            onAccept={acceptGrammar}
            onDismiss={() => {
              setGrammarLints([]);
              setGrammarNote('');
            }}
          />
        )}
        </div>

        <div className="canvas-body" ref={canvasRef}>
        <div
          className="page-view"
          style={focusMode ? ({ '--view-scale': String(viewPercent / 100) } as CSSProperties) : undefined}
          data-view-scale={focusMode ? viewPercent : 100}
        >
        {showPreview ? (
          <ExportPreview model={previewModel} doc={doc} />
        ) : viewMode === 'raw' ? (
          <RawWriteView
            doc={doc}
            style={manuscriptStyle}
            onEdit={editRaw}
            onSelection={setRawRange}
            onGrammarCheck={checkGrammar}
            onUnwrapHeading={(blockId) => commit((current) => removeBlock(current, blockId))}
            onDeleteHeading={(blockId) => {
              const block = docRef.current.blocks.find((item) => item.id === blockId);
              if (!block || !isHeadingType(block.type)) return;
              if (!window.confirm(headingLabels(block.type).confirm)) return;
              commit((current) => deleteHeadingRange(current, blockId));
            }}
            onInsertPageBreak={(blockId) => (blockId ? insertAfter(blockId, 'pageBreak') : insertAfterIndex(0, 'pageBreak'))}
            onInsertDivider={(blockId) => (blockId ? insertAfter(blockId, 'divider') : insertAfterIndex(0, 'divider'))}
            onInsertBlockquote={(blockId) => (blockId ? insertAfter(blockId, 'blockquote') : insertAfterIndex(0, 'blockquote'))}
            onInsertImage={(blockId) => (blockId ? insertAfter(blockId, 'image') : insertAfterIndex(0, 'image'))}
            onInsertTable={(x, y, blockId) => {
              const index = blockId ? docRef.current.blocks.findIndex((item) => item.id === blockId) + 1 : 0;
              openTablePicker(x, y, index < 0 ? docRef.current.blocks.length : index);
            }}
          />
        ) : doc.blocks.length === 0 ? (
          <div className="empty">
            <h2>The page is blank.</h2>
            <p>Start a chapter and write into it. Letters from the keyboard and from dictation are sealed. A paste from a chat window stays marked, and it is never certified.</p>
            <button type="button" className="primary" onClick={() => openChapter(0)}>Start a chapter</button>
          </div>
        ) : (
          <div
            className={`manuscript${dragging != null ? ' is-dragging' : ''}`}
            style={manuscriptStyle}
            data-manuscript-font={typography.font.id}
            data-manuscript-size={typography.sizePt}
            onMouseDown={(event) => {
              if (event.button !== 0) return;
              const target = event.target;
              if (!(target instanceof Element)) return;
              if (target.closest('.ms-field, button, input, textarea, a, select, label, .ms-gutter, .ms-table-wrap, .ms-image-wrap, .ms-divider-block, .ms-page-break, .ms-insert-gap, .ms-select-banner, .ms-select-check')) return;
              event.preventDefault();
              focusProseAt(event.clientY);
            }}
            onDragOver={(event) => {
              if (dragging == null || !canvasRef.current) return;
              scrollManuscriptNearEdge(event.clientY, canvasRef.current);
            }}
          >
            {selecting && (
              <ManuscriptSelectBanner
                count={selectedCount}
                onCombine={() => {
                  const chosen = [...selectedIds];
                  setSelectedIds(new Set());
                  commit((current) => combineParagraphs({
                    doc: current,
                    ids: chosen,
                    now: new Date().toISOString(),
                    newId: ids.current,
                  }));
                }}
                onDelete={() => {
                  const chosen = [...selectedIds];
                  setSelectedIds(new Set());
                  commit((current) => deleteParagraphs(current, chosen));
                }}
              />
            )}
            {doc.blocks.map((block, index) => {
              const provSpans = isProseBlock(block.type)
                ? doc.provenance[block.id]?.text ?? []
                : block.type === 'chapter' || block.type === 'scene' || block.type === 'section'
                  ? doc.provenance[block.id]?.title ?? []
                  : [];
              const provText = isProseBlock(block.type)
                ? block.text
                : block.type === 'table' ||
                    block.type === 'image' ||
                    block.type === 'pageBreak' ||
                    block.type === 'divider'
                  ? ''
                  : block.title;
              const state = passageState(provSpans, provText);
              const mixLabel =
                isProseBlock(block.type) && state === 'mixed'
                  ? formatMixLabel(provenanceMix(block.text, provSpans))
                  : null;
              const highlight = activeHit && activeHit.blockId === block.id
                ? { start: activeHit.start, end: activeHit.end }
                : null;
              return (
                <div key={block.id}>
                  <div
                    className={`ms-insert-gap${dropAt === index ? ' is-hot is-drop-over' : ''}`}
                    data-insert-index={index}
                    data-drop-label={dragging != null && dropAt === index ? dropPlaceLabel(doc.blocks[dragging]) : undefined}
                    aria-label={dragging != null && dropAt === index ? dropPlaceLabel(doc.blocks[dragging]) : undefined}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setGapMenu({
                        x: event.clientX,
                        y: event.clientY,
                        atIndex: index,
                        hasSelection: false,
                        canCutCopy: false,
                        suggestions: [],
                        misspelledWord: null,
                      });
                    }}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(BLOCK_MIME) || dragging == null) return;
                      e.preventDefault();
                      if (canvasRef.current) scrollManuscriptNearEdge(e.clientY, canvasRef.current);
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
                  />
                  <article id={`block-${block.id}`} className={`ms-block ms-${block.type}${dragging === index ? ' is-dragging' : ''}`}>
                    <div className="ms-gutter">
                      {selecting && block.type === 'paragraph' && (
                        <input
                          type="checkbox"
                          className="ms-select-check"
                          checked={selectedIds.has(block.id)}
                          aria-label="Select paragraph"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (event.shiftKey) selectParagraphRange(block.id);
                            else toggleParagraph(block.id);
                          }}
                          onChange={() => undefined}
                        />
                      )}
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
                    {block.type === 'table' && <span className="kicker">Table</span>}
                    {block.type === 'image' && <span className="kicker">Image</span>}
                    {block.type === 'pageBreak' && <span className="kicker">Page break</span>}
                    {block.type === 'divider' && <span className="kicker">Scene break</span>}
                    {block.type === 'blockquote' && <span className="kicker">Block quote</span>}
                    {block.type === 'table' ? (
                      <ManuscriptTable
                        rows={block.tableRows}
                        onCellChange={(row, col, value) => {
                          commit((current) => {
                            const b = current.blocks.find((x) => x.id === block.id);
                            if (!b || b.type !== 'table') return current;
                            const rows = (b.tableRows ?? [['']]).map((r) => [...r]);
                            while (rows.length <= row) rows.push([]);
                            const line = rows[row]!;
                            while (line.length <= col) line.push('');
                            line[col] = value;
                            return updateTableRows(current, block.id, rows);
                          });
                        }}
                        onAddRow={() => {
                          commit((current) => {
                            const b = current.blocks.find((x) => x.id === block.id);
                            if (!b || b.type !== 'table') return current;
                            const rows = [...(b.tableRows ?? [['', '', '']])];
                            const cols = Math.max(...rows.map((r) => r.length), 1);
                            rows.push(Array.from({ length: cols }, () => ''));
                            return updateTableRows(current, block.id, rows);
                          });
                        }}
                        onAddColumn={() => {
                          commit((current) => {
                            const b = current.blocks.find((x) => x.id === block.id);
                            if (!b || b.type !== 'table') return current;
                            const rows = (b.tableRows ?? [['']]).map((r) => [...r, '']);
                            return updateTableRows(current, block.id, rows);
                          });
                        }}
                        onRemoveRow={() => {
                          commit((current) => {
                            const b = current.blocks.find((x) => x.id === block.id);
                            if (!b || b.type !== 'table') return current;
                            const rows = [...(b.tableRows ?? [])];
                            if (rows.length <= 1) return current;
                            rows.pop();
                            return updateTableRows(current, block.id, rows);
                          });
                        }}
                      />
                    ) : block.type === 'image' ? (
                      <ManuscriptImage
                        src={block.imageSrc}
                        alt={block.imageAlt}
                        caption={block.imageCaption}
                        onPickFile={(file) => {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                            if (!dataUrl) return;
                            commit((current) => updateImageBlock(current, block.id, { imageSrc: dataUrl }));
                          };
                          reader.readAsDataURL(file);
                        }}
                        onAltChange={(alt) => commit((current) => updateImageBlock(current, block.id, { imageAlt: alt }))}
                        onCaptionChange={(caption) => commit((current) => updateImageBlock(current, block.id, { imageCaption: caption }))}
                        onClear={() => commit((current) => updateImageBlock(current, block.id, { imageSrc: '', imageAlt: '', imageCaption: '' }))}
                      />
                    ) : block.type === 'pageBreak' ? (
                      <ManuscriptPageBreak />
                    ) : block.type === 'divider' ? (
                      <ManuscriptDivider
                        style={block.dividerStyle ?? 'scene'}
                        label={block.title}
                        onStyleChange={(dividerStyle) => commit((current) => updateDividerBlock(current, block.id, { dividerStyle }))}
                        onLabelChange={(title) => commit((current) => updateDividerBlock(current, block.id, { title }))}
                      />
                    ) : (
                      <ProvenanceField
                        text={isProseBlock(block.type) ? block.text : block.title}
                        spans={isProseBlock(block.type) ? doc.provenance[block.id]?.text ?? [] : doc.provenance[block.id]?.title ?? []}
                        marks={isProseBlock(block.type) ? block.marks : []}
                        highlight={isProseBlock(block.type) || activeHit?.field === 'title' ? highlight : null}
                        placeholder={
                          block.type === 'paragraph'
                            ? 'Write the paragraph…'
                            : block.type === 'blockquote'
                              ? 'Block quote…'
                              : block.type === 'chapter'
                                ? 'Chapter title'
                                : block.type === 'scene'
                                  ? 'Scene title'
                                  : 'Section title'
                        }
                        className={
                          block.type === 'blockquote'
                            ? 'ms-para-editor ms-blockquote-editor'
                            : block.type === 'paragraph'
                              ? 'ms-para-editor'
                              : 'ms-title-editor'
                        }
                        ariaLabel={isProseBlock(block.type) ? (block.type === 'blockquote' ? 'Block quote' : 'Paragraph') : `${block.type} title`}
                        listStyle={block.type === 'paragraph' ? block.listStyle ?? null : null}
                        indentLevel={isProseBlock(block.type) ? block.indentLevel ?? 0 : 0}
                        onInsertTable={(x, y) => {
                          const at = docRef.current.blocks.findIndex((item) => item.id === block.id);
                          openTablePicker(x, y, at < 0 ? docRef.current.blocks.length : at + 1);
                        }}
                        onInsertImage={() => insertAfter(block.id, 'image')}
                        onInsertPageBreak={() => insertAfter(block.id, 'pageBreak')}
                        onInsertDivider={() => insertAfter(block.id, 'divider')}
                        onInsertBlockquote={() => insertAfter(block.id, 'blockquote')}
                        headingKind={isHeadingType(block.type) ? block.type : null}
                        onUnwrapHeading={() => commit((current) => removeBlock(current, block.id))}
                        onDeleteHeading={() => {
                          if (!isHeadingType(block.type)) return;
                          if (!window.confirm(headingLabels(block.type).confirm)) return;
                          commit((current) => deleteHeadingRange(current, block.id));
                        }}
                        certHashes={certHashes}
                        grammarSeals={grammarSeals}
                        onGrammarCheck={checkGrammar}
                        focusNonce={caretRequest?.blockId === block.id ? caretRequest.nonce : 0}
                        focusOffset={caretRequest?.blockId === block.id ? caretRequest.offset : null}
                        onCommit={(change) => applyCommit(block.id, isProseBlock(block.type) ? 'text' : 'title', change)}
                        onSplit={(offset) => commit((current) => splitParagraph({ doc: current, blockId: block.id, offset, now: new Date().toISOString(), newId: ids.current }))}
                        onMergeBackward={() => commit((current) => isProseBlock(block.type)
                          ? mergeParagraphBackward({ doc: current, blockId: block.id, now: new Date().toISOString(), newId: ids.current })
                          : current)}
                        onSelect={(start, end) => setSelection({ blockId: block.id, start, end })}
                        onFormat={onFormat}
                        onInternalDrag={(start, end) => {
                          textDrag.current = { blockId: block.id, start, end };
                        }}
                        renderToken={renderToken}
                        showProvenance={showHighlights}
                        blockId={block.id}
                        onCertificationHover={showHighlights ? setLinkedCardId : undefined}
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
                    )}
                    <div className="ms-meta">
                      {showHighlights && isProseBlock(block.type) && (
                        <>
                          <span className={`pip pip-${state}`}>
                            {state === 'empty' ? 'Empty' : state === 'certified' ? 'Certified' : state === 'mixed' ? 'Mixed' : 'Uncertified'}
                          </span>
                          {mixLabel && <span className="mix-label" title="Character mix in this paragraph">{mixLabel}</span>}
                        </>
                      )}
                      {showHighlights &&
                        !isProseBlock(block.type) &&
                        block.type !== 'table' &&
                        block.type !== 'image' &&
                        block.type !== 'pageBreak' &&
                        block.type !== 'divider' &&
                        provText.trim() && (
                        <span className={`pip pip-${state}`}>
                          {state === 'certified' ? 'Certified' : state === 'mixed' ? 'Mixed' : 'Uncertified'}
                        </span>
                      )}
                      {isHeadingType(block.type) ? (
                        <HeadingRemoveControl
                          kind={block.type}
                          onUnwrap={() => commit((current) => removeBlock(current, block.id))}
                          onDelete={() => {
                            if (!window.confirm(headingLabels(block.type as 'chapter' | 'scene' | 'section').confirm)) return;
                            commit((current) => deleteHeadingRange(current, block.id));
                          }}
                        />
                      ) : (
                        <button type="button" onClick={() => commit((current) => removeBlock(current, block.id))}>
                          Remove
                        </button>
                      )}
                    </div>
                  </article>
                </div>
              );
            })}
            <div
              className={`ms-insert-gap${dropAt === doc.blocks.length ? ' is-hot is-drop-over' : ''}`}
              data-insert-index={doc.blocks.length}
              data-drop-label={dragging != null && dropAt === doc.blocks.length ? dropPlaceLabel(doc.blocks[dragging]) : undefined}
              aria-label={dragging != null && dropAt === doc.blocks.length ? dropPlaceLabel(doc.blocks[dragging]) : undefined}
              onContextMenu={(event) => {
                event.preventDefault();
                setGapMenu({
                  x: event.clientX,
                  y: event.clientY,
                  atIndex: doc.blocks.length,
                  hasSelection: false,
                  canCutCopy: false,
                  suggestions: [],
                  misspelledWord: null,
                });
              }}
              onDragOver={(e) => {
                if (dragging == null) return;
                e.preventDefault();
                if (canvasRef.current) scrollManuscriptNearEdge(e.clientY, canvasRef.current);
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
            <div className="ms-page-tail" data-page-tail="true" />
          </div>
        )}
        {!focusMode && !showPreview && (
          <p className="canvas-note">Drag a handle to reorder a chapter with the prose under it, or move a paragraph. Moving text keeps a keyboard seal on that text. Dropping words in from another app does not.</p>
        )}
        </div>
        </div>
      </main>

      {!focusMode && (
        <NotesRail
          doc={doc}
          activeBlockId={noteBlockId}
          saveError={saveError}
          collapsed={notesCollapsed}
          onToggleCollapsed={() => setNotesCollapsed((collapsed) => !collapsed)}
          onChange={publish}
          onShowBlock={(blockId) => {
            if (viewMode === 'raw' || viewMode === 'preview') setViewMode('manuscript');
            setSelection({ blockId, start: 0, end: 0 });
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                document.getElementById(`block-${blockId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
              });
            });
          }}
        />
      )}
      {!focusMode && (
      <aside className={`points${certCollapsed ? ' is-collapsed' : ''}`}>
        <button
          type="button"
          className={`cert-collapse-toggle${certCollapsed ? ' is-collapsed-mark' : ''}`}
          onClick={() => setCertCollapsed((c) => !c)}
          aria-expanded={!certCollapsed}
          aria-label={certCollapsed ? 'Expand certification pane' : 'Collapse certification pane'}
          data-tooltip={certCollapsed ? 'Expand certification pane' : 'Collapse certification pane'}
        >
          {certCollapsed ? <CertificationMark size={26} /> : <span className="cert-collapse-chevron" aria-hidden="true">›</span>}
        </button>
        <div className="points-body">
          <div className="points-head">
            <div className="points-head__brand">
              <CertificationMark size={28} className="points-head__mark" />
              <div>
                <p className="eyebrow">Certification</p>
                <h2>Sealed passages</h2>
              </div>
            </div>
          </div>
          {doc.points.length === 0 && (
            <p className="points-empty">Nothing is sealed yet. Keyboard and dictated text land here with a content hash and the input events behind them. Pasted text never will.</p>
          )}
          {(doc.points.length > 0 || openCards.length > 0) && (
            <ol className="point-list" ref={pointListRef}>
              {doc.points.map((point) => (
                <li
                  key={point.id}
                  data-card-id={point.id}
                  data-origin={point.origin}
                  className={linkedCardId === point.id ? 'is-linked' : undefined}
                >
                  <header>
                    <span>{point.origin === 'dictation' ? 'Dictation, sealed' : 'Certified'}</span>
                    <time dateTime={point.updatedAt}>{new Date(point.updatedAt).toLocaleString()}</time>
                  </header>
                  <blockquote>{point.text}</blockquote>
                  <code data-sha256={point.contentHash} data-tooltip={point.contentHash} data-tooltip-wrap="true">{point.contentHash.slice(0, 16)}…</code>
                  <DeviceLine stored={point.typingDevice} live={liveDevice} />
                  <p>{point.evidence.eventCount} observed input event{point.evidence.eventCount === 1 ? '' : 's'} · {point.evidence.inputTypes.join(', ') || 'keyboard'}</p>
                  {point.grammar?.used && (
                    <p className="point-grammar">{point.grammar.comment || GRAMMAR_CHECK_COMMENT}</p>
                  )}
                  {point.lineage && <p className="lineage">{point.lineage}</p>}
                </li>
              ))}
              {openCards.length > 0 && doc.points.length > 0 && (
                <li className="point-list__divider">Not sealed</li>
              )}
              {openCards.map((card) => (
                <li
                  key={card.id}
                  data-card-id={card.id}
                  data-origin={card.origin}
                  className={`is-uncertified${linkedCardId === card.id ? ' is-linked' : ''}`}
                >
                  <header>
                    <span>Uncertified</span>
                    <span>{originWord(card.origin)}</span>
                  </header>
                  <blockquote>{card.text}</blockquote>
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
        </div>
      </aside>
      )}
    </div>
    {tablePicker && (
      <TableGridPicker
        x={tablePicker.x}
        y={tablePicker.y}
        onClose={() => setTablePicker(null)}
        onSelect={(rows, cols) => {
          const at = tablePicker.at;
          setTablePicker(null);
          commit((current) => insertStructure(current, 'table', at, ids.current(), { rows, cols }));
        }}
      />
    )}
    <FieldContextMenu
      variant="gap"
      state={gapMenu}
      anchorRef={gapAnchorRef}
      onClose={() => setGapMenu(null)}
      onCut={() => undefined}
      onCopy={() => undefined}
      onPaste={() => undefined}
      onSelectAll={() => undefined}
      onInsertPageBreak={() => gapMenu && insertAfterIndex(gapMenu.atIndex, 'pageBreak')}
      onInsertDivider={() => gapMenu && insertAfterIndex(gapMenu.atIndex, 'divider')}
      onInsertBlockquote={() => gapMenu && insertAfterIndex(gapMenu.atIndex, 'blockquote')}
      onInsertImage={() => gapMenu && insertAfterIndex(gapMenu.atIndex, 'image')}
      onInsertTable={(x, y) => {
        if (!gapMenu) return;
        openTablePicker(x, y, gapMenu.atIndex);
      }}
    />
    </>
  );
}

function DeviceLine({ stored, live }: { stored?: string; live: string | null }) {
  const label = formatTypingDeviceLabel(stored, live);
  if (!label) return null;
  return <p className="point-device">Device: {label}</p>;
}

function scrollManuscriptNearEdge(clientY: number, scroller: HTMLElement) {
  const box = scroller.getBoundingClientRect();
  const zone = 56;
  const max = 22;
  if (clientY < box.top + zone) {
    scroller.scrollTop -= Math.ceil(max * ((box.top + zone - clientY) / zone));
  } else if (clientY > box.bottom - zone) {
    scroller.scrollTop += Math.ceil(max * ((clientY - (box.bottom - zone)) / zone));
  }
}

function scrollCardIntoCertificationPane(card: HTMLElement) {
  const pane = card.closest('.points');
  if (!pane || card.getClientRects().length === 0) return;
  let node = card.parentElement;
  while (node && pane.contains(node)) {
    const overflowY = getComputedStyle(node).overflowY;
    const scrollable =
      (overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1;
    if (scrollable) {
      const bounds = node.getBoundingClientRect();
      const rect = card.getBoundingClientRect();
      const top = Math.max(bounds.top, 0);
      const bottom = Math.min(bounds.bottom, window.innerHeight);
      if (bottom > top + 24) {
        const delta = scrollDelta(top, bottom, rect.top, rect.bottom);
        if (delta !== 0) node.scrollTop += delta;
      }
    }
    node = node.parentElement;
  }
}

function originWord(origin: string): string {
  if (origin === 'dictation') return 'Dictation';
  if (origin === 'paste') return 'Paste';
  if (origin === 'drop') return 'Drop';
  if (origin === 'other') return 'Other';
  return 'Uncertified';
}
