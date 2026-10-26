import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { InsertionOrigin } from '../core/certification.ts';
import { menuSpellSuggestions, spellcheckReplacement, wordAroundOffset } from '../core/contextMenu.ts';
import type { GrammarScope } from '../core/grammar.ts';
import { isHeadingType } from '../core/manuscript.ts';
import { flattenRaw, rawSegmentAt, type RawSegment } from '../core/rawWrite.ts';
import type { ManuscriptDocument } from '../core/document.ts';
import { styledSpans } from '../core/richText.ts';
import { suggestSpellings } from '../core/spellSuggest.ts';
import { isProseBlock, type InlineMark } from '../core/types.ts';
import { FieldContextMenu, type ContextMenuState, type MenuAnchor } from './FieldContextMenu.tsx';

export type RawEdit = {
  start: number;
  end: number;
  insert: string;
  origin: InsertionOrigin | null;
  inputType: string;
};

export function RawWriteView({
  doc,
  style,
  onEdit,
  onSelection,
  canInsertDictation = false,
  onInsertDictation,
  canUnselectInsert = false,
  onUnselectInsert,
  onInsertPageBreak,
  onInsertDivider,
  onInsertBlockquote,
  onInsertImage,
  onInsertTable,
  onGrammarCheck,
  onUnwrapHeading,
  onDeleteHeading,
}: {
  doc: ManuscriptDocument;
  style?: CSSProperties;
  onEdit: (edit: RawEdit) => void;
  onSelection: (range: { start: number; end: number }) => void;
  canInsertDictation?: boolean;
  onInsertDictation?: (target: { atIndex?: number; blockId?: string; splitOffset?: number }) => void;
  canUnselectInsert?: boolean;
  onUnselectInsert?: () => void;
  onInsertPageBreak?: (blockId: string | null) => void;
  onInsertDivider?: (blockId: string | null) => void;
  onInsertBlockquote?: (blockId: string | null) => void;
  onInsertImage?: (blockId: string | null) => void;
  onInsertTable?: (x: number, y: number, blockId: string | null) => void;
  onGrammarCheck?: (scope: GrammarScope, anchorId?: string) => void;
  onUnwrapHeading?: (blockId: string) => void;
  onDeleteHeading?: (blockId: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<{ start: number; end: number } | null>(null);
  const ownEdit = useRef(false);
  const anchorRef = useRef<MenuAnchor | null>(null);
  const replaceRef = useRef<{ start: number; end: number } | null>(null);
  const clipRef = useRef<{ start: number; end: number } | null>(null);
  const menuBlockRef = useRef<string | null>(null);
  const menuAtRef = useRef(0);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [headingKind, setHeadingKind] = useState<'chapter' | 'scene' | 'section' | null>(null);
  const flat = flattenRaw(doc);
  const modelText = useRef(flat.text);
  const seenDoc = useRef(doc);
  const blank = flat.segments.length === 0;

  useLayoutEffect(() => {
    if (seenDoc.current !== doc) {
      seenDoc.current = doc;
      modelText.current = flattenRaw(doc).text;
    }
    const caret = caretRef.current;
    const root = rootRef.current;
    if (!caret || !root) return;
    const active = document.activeElement;
    const inToolbar = active instanceof Element && Boolean(active.closest('.toolbar'));
    if (!ownEdit.current && active !== root && !inToolbar) return;
    placeRange(root, caret.start, caret.end);
    if (ownEdit.current || inToolbar) root.focus();
    ownEdit.current = false;
  }, [doc]);

  const report = () => {
    const root = rootRef.current;
    if (!root) return;
    const range = readRange(root);
    if (!range) return;
    caretRef.current = range;
    onSelection(range);
  };

  const edit = (start: number, end: number, insert: string, origin: InsertionOrigin | null, inputType: string) => {
    const current = modelText.current;
    const from = Math.max(0, Math.min(start, current.length));
    const to = Math.max(from, Math.min(end, current.length));
    modelText.current = current.slice(0, from) + insert + current.slice(to);
    const next = from + insert.length;
    caretRef.current = { start: next, end: next };
    ownEdit.current = true;
    onSelection({ start: next, end: next });
    onEdit({ start: from, end: to, insert, origin, inputType });
  };

  const syncFromDom = (origin: InsertionOrigin, inputType: string) => {
    const root = rootRef.current;
    if (!root || ownEdit.current) return;
    const text = readFlat(root);
    const current = modelText.current;
    if (text === current) return;
    let prefix = 0;
    const limit = Math.min(text.length, current.length);
    while (prefix < limit && text[prefix] === current[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < text.length - prefix &&
      suffix < current.length - prefix &&
      text[text.length - 1 - suffix] === current[current.length - 1 - suffix]
    ) {
      suffix += 1;
    }
    edit(prefix, current.length - suffix, text.slice(prefix, text.length - suffix), origin, inputType);
  };

  const closeMenu = () => {
    anchorRef.current = null;
    replaceRef.current = null;
    clipRef.current = null;
    menuBlockRef.current = null;
    setHeadingKind(null);
    setMenu(null);
  };

  const writeClipboard = async (start: number, end: number) => {
    const text = modelText.current.slice(start, end);
    if (!text) return;
    await navigator.clipboard.writeText(text).catch(() => undefined);
  };

  return (
    <>
    <div
      ref={rootRef}
      className={`raw-page${blank ? ' is-blank' : ''}`}
      style={style}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Raw write"
      aria-multiline="true"
      spellCheck
      data-placeholder="The page is blank. Write now, and give the words a structure when you are ready."
      onBeforeInput={(event) => {
        const native = event.nativeEvent;
        if (native.isComposing) return;
        const root = rootRef.current;
        const range = root ? readRange(root) : null;
        if (!range) return;
        const type = typeof native.inputType === 'string' ? native.inputType : '';
        if (type === 'insertText') {
          event.preventDefault();
          edit(range.start, range.end, native.data ?? '', 'keyboard', type);
          return;
        }
        if (type === 'insertParagraph' || type === 'insertLineBreak') {
          event.preventDefault();
          edit(range.start, range.end, '\n', 'keyboard', type);
          return;
        }
        if (type === 'insertFromPaste' || type === 'insertFromDrop') {
          event.preventDefault();
          return;
        }
        if (type === 'deleteContentBackward' || type === 'deleteWordBackward') {
          event.preventDefault();
          const start = range.start === range.end ? Math.max(0, range.start - (type === 'deleteWordBackward' ? wordSpan(modelText.current, range.start) : 1)) : range.start;
          edit(start, range.end, '', null, type);
          return;
        }
        if (type === 'deleteContentForward' || type === 'deleteWordForward') {
          event.preventDefault();
          const end = range.start === range.end ? Math.min(modelText.current.length, range.start + 1) : range.end;
          edit(range.start, end, '', null, type);
          return;
        }
        if (type.startsWith('delete') || type === 'insertReplacementText') {
          event.preventDefault();
          edit(range.start, range.end, native.data ?? '', native.data ? 'keyboard' : null, type);
        }
      }}
      onInput={(event) => {
        const native = event.nativeEvent;
        if (native instanceof InputEvent && native.isComposing) return;
        const type = native instanceof InputEvent && native.inputType ? native.inputType : 'insertText';
        if (type.startsWith('delete')) syncFromDom('keyboard', type);
        else if (type.includes('Paste') || type === 'insertFromPaste') syncFromDom('paste', type);
        else if (type.includes('Drop') || type === 'insertFromDrop') syncFromDom('drop', type);
        else syncFromDom('keyboard', type);
      }}
      onPaste={(event) => {
        event.preventDefault();
        const root = rootRef.current;
        const range = root ? readRange(root) : null;
        if (!range) return;
        const text = event.clipboardData.getData('text/plain').replace(/\r\n/g, '\n');
        edit(range.start, range.end, text, 'paste', 'insertFromPaste');
      }}
      onDrop={(event) => {
        const text = event.dataTransfer.getData('text/plain');
        if (!text) return;
        event.preventDefault();
        const root = rootRef.current;
        const range = root ? readRange(root) : caretRef.current;
        if (!range) return;
        edit(range.start, range.end, text.replace(/\r\n/g, '\n'), 'drop', 'insertFromDrop');
      }}
      onKeyUp={report}
      onMouseUp={report}
      onSelect={report}
      onContextMenu={(event) => {
        event.preventDefault();
        const root = rootRef.current;
        if (!root) return;
        const point = rangeFromPoint(event.clientX, event.clientY);
        const at =
          point && root.contains(point.startContainer)
            ? pointAt(root, point.startContainer, point.startOffset)
            : readRange(root)?.start ?? caretRef.current?.start ?? 0;
        if (point && root.contains(point.startContainer)) {
          const rect = point.getBoundingClientRect();
          anchorRef.current = { range: point, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
        } else {
          anchorRef.current = null;
        }
        const text = modelText.current;
        const word = wordAroundOffset(text, at);
        const sel = readRange(root) ?? { start: at, end: at };
        const selected = sel.end > sel.start;
        const segment = rawSegmentAt(flattenRaw(doc), selected ? sel.start : at);
        const suggestions = word
          ? menuSpellSuggestions({
              word: word.word,
              event: event.nativeEvent,
              platform: window.humanuscript?.getSpellSuggestions,
              fallback: suggestSpellings,
            })
          : [];
        replaceRef.current = word ? { start: word.start, end: word.end } : null;
        clipRef.current = selected ? { start: sel.start, end: sel.end } : word ? { start: word.start, end: word.end } : null;
        menuAtRef.current = at;
        menuBlockRef.current = segment?.blockId ?? null;
        setHeadingKind(segment && isHeadingType(segment.kind) ? segment.kind : null);
        onSelection(selected ? sel : { start: at, end: at });
        setMenu({
          x: event.clientX,
          y: event.clientY,
          hasSelection: selected,
          canCutCopy: Boolean(clipRef.current),
          suggestions,
          misspelledWord: word ? word.word : null,
        });
      }}
    >
      {blank ? (
        <div data-raw-block="blank" className="raw-block raw-block--paragraph">
          <br />
        </div>
      ) : (
        flat.segments.map((segment) => (
          <div key={segment.blockId} data-raw-block={segment.blockId} className={`raw-block raw-block--${segment.kind}`}>
            {segment.text ? <RawRuns text={segment.text} marks={marksFor(doc, segment)} /> : <br />}
          </div>
        ))
      )}
    </div>
    <FieldContextMenu
      state={menu}
      anchorRef={anchorRef}
      headingKind={headingKind}
      canInsertDictation={canInsertDictation}
      canUnselectInsert={canUnselectInsert}
      onClose={closeMenu}
      onUnselectInsert={onUnselectInsert}
      onInsertDictation={() => {
        const blockId = menuBlockRef.current;
        const segment = blockId ? rawSegmentAt(flattenRaw(doc), menuAtRef.current) : null;
        if (segment && (segment.kind === 'paragraph' || segment.kind === 'blockquote')) {
          const offset = Math.max(0, Math.min(menuAtRef.current - segment.start, segment.text.length));
          onInsertDictation?.({ blockId: segment.blockId, splitOffset: offset });
          return;
        }
        if (!segment) {
          onInsertDictation?.({ atIndex: 0 });
          return;
        }
        const index = doc.blocks.findIndex((block) => block.id === segment.blockId);
        onInsertDictation?.({ atIndex: index < 0 ? doc.blocks.length : index + 1 });
      }}
      onCut={() => {
        const clip = clipRef.current;
        if (!clip) return;
        void writeClipboard(clip.start, clip.end);
        edit(clip.start, clip.end, '', null, 'deleteByCut');
      }}
      onCopy={() => {
        const clip = clipRef.current;
        if (!clip) return;
        void writeClipboard(clip.start, clip.end);
      }}
      onPaste={async () => {
        const text = await navigator.clipboard.readText().catch(() => '');
        if (!text) return;
        const root = rootRef.current;
        const range = (root ? readRange(root) : null) ?? caretRef.current ?? { start: modelText.current.length, end: modelText.current.length };
        edit(range.start, range.end, text.replace(/\r\n/g, '\n'), 'paste', 'insertFromPaste');
      }}
      onSelectAll={() => {
        const root = rootRef.current;
        if (!root) return;
        const end = modelText.current.length;
        placeRange(root, 0, end);
        caretRef.current = { start: 0, end };
        onSelection({ start: 0, end });
      }}
      onReplaceWord={(replacement) => {
        const range = replaceRef.current;
        if (!range) return;
        const change = spellcheckReplacement({
          start: range.start,
          end: range.end,
          insert: replacement,
          at: new Date().toISOString(),
        });
        edit(change.start, change.end, change.insert, change.origin, change.event.inputType);
      }}
      onGrammarCheck={(scope) => onGrammarCheck?.(scope, menuBlockRef.current ?? undefined)}
      onUnwrapHeading={() => {
        const blockId = menuBlockRef.current;
        if (blockId) onUnwrapHeading?.(blockId);
      }}
      onDeleteHeading={() => {
        const blockId = menuBlockRef.current;
        if (blockId) onDeleteHeading?.(blockId);
      }}
      onInsertPageBreak={() => onInsertPageBreak?.(menuBlockRef.current)}
      onInsertDivider={() => onInsertDivider?.(menuBlockRef.current)}
      onInsertBlockquote={() => onInsertBlockquote?.(menuBlockRef.current)}
      onInsertImage={() => onInsertImage?.(menuBlockRef.current)}
      onInsertTable={(x, y) => onInsertTable?.(x, y, menuBlockRef.current)}
    />
    </>
  );
}

function rangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos?.offsetNode) {
    try {
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
      return range;
    } catch {
      return null;
    }
  }
  const legacy = doc.caretRangeFromPoint?.(x, y);
  return legacy ? legacy.cloneRange() : null;
}

function marksFor(doc: ManuscriptDocument, segment: RawSegment): InlineMark[] {
  const block = doc.blocks.find((item) => item.id === segment.blockId);
  if (!block || !isProseBlock(block.type)) return [];
  return block.marks;
}

function RawRuns({ text, marks }: { text: string; marks: InlineMark[] }) {
  return styledSpans(text, marks).map((span, index) => {
    let body: ReactNode = span.text;
    if (span.bold) body = <strong>{body}</strong>;
    if (span.italic) body = <em>{body}</em>;
    if (span.underline) body = <u>{body}</u>;
    if (span.strike) body = <s>{body}</s>;
    return <span key={`${index}-${span.text.slice(0, 12)}`}>{body}</span>;
  });
}

function readFlat(root: HTMLElement): string {
  return [...root.querySelectorAll<HTMLElement>('[data-raw-block]')].map((block) => block.textContent ?? '').join('\n');
}

function wordSpan(text: string, index: number): number {
  let start = index;
  while (start > 0 && /\S/.test(text[start - 1] ?? '')) start -= 1;
  return Math.max(1, index - start);
}

function blockStart(blocks: HTMLElement[], index: number): number {
  let flat = 0;
  for (let i = 0; i < index; i += 1) {
    flat += blocks[i]?.textContent?.length ?? 0;
    flat += 1;
  }
  return flat;
}

function offsetIn(root: Node, target: Node, targetOffset: number): number {
  if (root === target) return 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let count = 0;
  let node = walker.nextNode();
  while (node) {
    if (node === target) return count + targetOffset;
    count += node.textContent?.length ?? 0;
    node = walker.nextNode();
  }
  return count;
}

function readRange(root: HTMLElement): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const start = pointAt(root, range.startContainer, range.startOffset);
  const end = pointAt(root, range.endContainer, range.endOffset);
  return start <= end ? { start, end } : { start: end, end: start };
}

function pointAt(root: HTMLElement, container: Node, offset: number): number {
  const blocks = [...root.querySelectorAll<HTMLElement>('[data-raw-block]')];
  if (container === root) {
    return blockStart(blocks, Math.max(0, Math.min(offset, blocks.length)));
  }
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (block.contains(container)) return blockStart(blocks, index) + offsetIn(block, container, offset);
  }
  return blockStart(blocks, blocks.length);
}

function placeRange(root: HTMLElement, start: number, end: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const from = pointIn(root, start);
  const to = pointIn(root, end);
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

function pointIn(root: HTMLElement, position: number): { node: Node; offset: number } {
  const blocks = [...root.querySelectorAll<HTMLElement>('[data-raw-block]')];
  if (!blocks.length) return { node: root, offset: 0 };
  let remaining = Math.max(0, position);
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (index > 0) {
      if (remaining === 0) return firstPoint(block);
      remaining -= 1;
    }
    const length = block.textContent?.length ?? 0;
    if (remaining <= length) return pointInBlock(block, remaining);
    remaining -= length;
  }
  const last = blocks[blocks.length - 1]!;
  return pointInBlock(last, last.textContent?.length ?? 0);
}

function firstPoint(block: HTMLElement): { node: Node; offset: number } {
  return pointInBlock(block, 0);
}

function pointInBlock(block: HTMLElement, offset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let last: Text | null = null;
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    last = text;
    if (remaining <= text.length) return { node: text, offset: remaining };
    remaining -= text.length;
    node = walker.nextNode();
  }
  if (last) return { node: last, offset: last.length };
  return { node: block, offset: 0 };
}
