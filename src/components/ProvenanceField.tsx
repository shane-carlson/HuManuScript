import { useLayoutEffect, useRef } from 'react';
import { offsetsFromDomRange, setDomCaretFromOffset } from '../core/domCaret.ts';
import type { InputEvidence, InsertionOrigin, ProvenanceSpan } from '../core/certification.ts';
import { classifyInputType } from '../core/certification.ts';
import type { InlineMark, InlineMarkKind } from '../core/types.ts';

export interface FieldCommit {
  start: number;
  end: number;
  insert: string;
  origin: InsertionOrigin | null;
  event: InputEvidence | null;
  caret: number;
}

interface Piece {
  text: string;
  origin: ProvenanceSpan['origin'];
  certificationId?: string;
  marks: InlineMarkKind[];
  hit: boolean;
}

function pieces(
  text: string,
  spans: ProvenanceSpan[],
  marks: InlineMark[],
  highlight: { start: number; end: number } | null,
): Piece[] {
  if (!text) return [];
  const bounds = new Set<number>([0, text.length]);
  for (const span of spans) {
    bounds.add(Math.max(0, Math.min(span.start, text.length)));
    bounds.add(Math.max(0, Math.min(span.end, text.length)));
  }
  for (const mark of marks) {
    bounds.add(Math.max(0, Math.min(mark.start, text.length)));
    bounds.add(Math.max(0, Math.min(mark.end, text.length)));
  }
  if (highlight) {
    bounds.add(Math.max(0, Math.min(highlight.start, text.length)));
    bounds.add(Math.max(0, Math.min(highlight.end, text.length)));
  }
  const cuts = [...bounds].filter((n) => n >= 0 && n <= text.length).sort((a, b) => a - b);
  const out: Piece[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i]!;
    const end = cuts[i + 1]!;
    if (end <= start) continue;
    const span = spans.find((item) => item.start <= start && item.end >= end);
    out.push({
      text: text.slice(start, end),
      origin: span?.origin ?? 'other',
      certificationId: span?.certificationId,
      marks: marks.filter((mark) => mark.start <= start && mark.end >= end).map((mark) => mark.kind),
      hit: Boolean(highlight && highlight.start <= start && highlight.end >= end),
    });
  }
  return out;
}

function paint(root: HTMLElement, rendered: Piece[]) {
  root.replaceChildren();
  const order: InlineMarkKind[] = ['bold', 'italic', 'underline', 'strike'];
  for (const piece of rendered) {
    const span = document.createElement('span');
    span.className = `prov prov-${piece.origin}${piece.hit ? ' find-hit' : ''}`;
    span.dataset.origin = piece.origin;
    if (piece.certificationId) span.dataset.cert = piece.certificationId;
    let parent: Node = span;
    for (const kind of order) {
      if (!piece.marks.includes(kind)) continue;
      const tag = kind === 'bold' ? 'strong' : kind === 'italic' ? 'em' : kind === 'underline' ? 'u' : 's';
      const el = document.createElement(tag);
      parent.appendChild(el);
      parent = el;
    }
    parent.appendChild(document.createTextNode(piece.text));
    root.appendChild(span);
  }
}

function diff(before: string, after: string): { start: number; end: number; insert: string } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let tail = 0;
  while (
    tail < before.length - start &&
    tail < after.length - start &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1;
  }
  return { start, end: before.length - tail, insert: after.slice(start, after.length - tail) };
}

export function ProvenanceField({
  text,
  spans,
  marks = [],
  highlight = null,
  placeholder,
  className,
  ariaLabel,
  onCommit,
  onSplit,
  onMergeBackward,
  onSelect,
  onFormat,
  onInternalDrag,
  onInternalDrop,
}: {
  text: string;
  spans: ProvenanceSpan[];
  marks?: InlineMark[];
  highlight?: { start: number; end: number } | null;
  placeholder: string;
  className?: string;
  ariaLabel: string;
  onCommit: (commit: FieldCommit) => void;
  onSplit?: (offset: number) => void;
  onMergeBackward?: () => void;
  onSelect?: (start: number, end: number) => void;
  onFormat?: (kind: InlineMarkKind) => void;
  onInternalDrag?: (start: number, end: number) => void;
  onInternalDrop?: (offset: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const caret = useRef<number | null>(null);
  const skipPaste = useRef(false);
  const textRef = useRef(text);

  const signature = JSON.stringify({ text, spans, marks, highlight });

  useLayoutEffect(() => {
    textRef.current = text;
    const el = ref.current;
    if (!el || composing.current) return;
    paint(el, pieces(text, spans, marks, highlight));
    if (caret.current != null && document.activeElement === el) {
      try {
        setDomCaretFromOffset(el, caret.current);
      } catch {
        /* The selection can sit on a detached node during a fast edit. */
      }
      caret.current = null;
    }
  }, [signature, text, spans, marks, highlight]);

  const selection = () => {
    const el = ref.current;
    if (!el) return { start: textRef.current.length, end: textRef.current.length };
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      return { start: textRef.current.length, end: textRef.current.length };
    }
    return offsetsFromDomRange(el, sel.getRangeAt(0));
  };

  const report = () => onSelect?.(selection().start, selection().end);

  return (
    <div
      ref={ref}
      className={`ms-field ${className ?? ''}`}
      contentEditable
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      data-placeholder={placeholder}
      spellCheck
      suppressContentEditableWarning
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        const el = ref.current;
        if (!el) return;
        const next = el.textContent ?? '';
        const change = diff(textRef.current, next);
        if (!change.insert && change.start === change.end) return;
        caret.current = change.start + change.insert.length;
        onCommit({
          ...change,
          origin: 'keyboard',
          event: {
            at: new Date().toISOString(),
            inputType: 'insertCompositionText',
            data: change.insert || null,
            trusted: true,
          },
          caret: change.start + change.insert.length,
        });
      }}
      onBeforeInput={(e) => {
        const input = e.nativeEvent;
        if (composing.current || input.inputType === 'insertCompositionText') return;
        const classified = classifyInputType(input.inputType, input.isTrusted);
        if (classified.kind === 'ignore') return;
        if (classified.kind === 'split') {
          e.preventDefault();
          const at = selection().start;
          caret.current = 0;
          onSplit?.(at);
          return;
        }
        if (
          (classified.kind === 'insert' && (classified.origin === 'paste' || classified.origin === 'drop')) ||
          skipPaste.current
        ) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        const range = selection();
        let start = range.start;
        let end = range.end;
        const target = input.getTargetRanges?.()[0];
        if (target && ref.current) {
          const mapped = document.createRange();
          mapped.setStart(target.startContainer, target.startOffset);
          mapped.setEnd(target.endContainer, target.endOffset);
          const offsets = offsetsFromDomRange(ref.current, mapped);
          start = offsets.start;
          end = offsets.end;
        }
        if (classified.kind === 'delete') {
          if (start === end && input.inputType === 'deleteContentBackward') {
            if (start === 0) {
              onMergeBackward?.();
              return;
            }
            start -= 1;
          } else if (start === end && input.inputType === 'deleteContentForward') {
            end = Math.min(textRef.current.length, end + 1);
          }
          if (start === end) return;
          caret.current = start;
          onCommit({
            start,
            end,
            insert: '',
            origin: null,
            event: {
              at: new Date().toISOString(),
              inputType: input.inputType,
              data: null,
              trusted: input.isTrusted,
            },
            caret: start,
          });
          return;
        }
        const insert = input.data ?? '';
        if (!insert && start === end) return;
        caret.current = start + insert.length;
        onCommit({
          start,
          end,
          insert,
          origin: classified.origin,
          event: {
            at: new Date().toISOString(),
            inputType: input.inputType,
            data: insert || null,
            trusted: input.isTrusted,
          },
          caret: start + insert.length,
        });
      }}
      onPaste={(e) => {
        e.preventDefault();
        const insert = e.clipboardData.getData('text/plain');
        if (!insert) return;
        const range = selection();
        skipPaste.current = true;
        caret.current = range.start + insert.split(/\r?\n/)[0]!.length;
        onCommit({
          start: range.start,
          end: range.end,
          insert,
          origin: 'paste',
          event: {
            at: new Date().toISOString(),
            inputType: 'insertFromPaste',
            data: insert,
            trusted: e.nativeEvent.isTrusted,
          },
          caret: range.start + insert.split(/\r?\n/)[0]!.length,
        });
        window.setTimeout(() => {
          skipPaste.current = false;
        }, 0);
      }}
      onDragStart={(e) => {
        const range = selection();
        if (range.end <= range.start) return;
        e.dataTransfer.setData('application/x-humanuscript-text', `${range.start}:${range.end}`);
        e.dataTransfer.effectAllowed = 'move';
        onInternalDrag?.(range.start, range.end);
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes('application/x-humanuscript-block')) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('application/x-humanuscript-text')) {
          onInternalDrop?.(selection().start);
          return;
        }
        const insert = e.dataTransfer.getData('text/plain');
        if (!insert) return;
        const range = selection();
        caret.current = range.start + insert.length;
        onCommit({
          start: range.start,
          end: range.end,
          insert,
          origin: 'drop',
          event: {
            at: new Date().toISOString(),
            inputType: 'insertFromDrop',
            data: insert,
            trusted: e.nativeEvent.isTrusted,
          },
          caret: range.start + insert.length,
        });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Backspace' && !textRef.current && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          onMergeBackward?.();
          return;
        }
        const meta = e.metaKey || e.ctrlKey;
        if (!meta || e.altKey) return;
        const key = e.key.toLowerCase();
        if (key === 'b' || key === 'i' || key === 'u') {
          e.preventDefault();
          onFormat?.(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline');
        }
      }}
      onKeyUp={report}
      onMouseUp={report}
      onFocus={report}
    />
  );
}
