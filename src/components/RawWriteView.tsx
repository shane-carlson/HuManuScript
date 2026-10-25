import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { InsertionOrigin } from '../core/certification.ts';
import { flattenRaw, type RawSegment } from '../core/rawWrite.ts';
import type { ManuscriptDocument } from '../core/document.ts';
import { styledSpans } from '../core/richText.ts';
import { isProseBlock, type InlineMark } from '../core/types.ts';

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
}: {
  doc: ManuscriptDocument;
  style?: CSSProperties;
  onEdit: (edit: RawEdit) => void;
  onSelection: (range: { start: number; end: number }) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<{ start: number; end: number } | null>(null);
  const ownEdit = useRef(false);
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

  return (
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
  );
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
