import { useEffect, useRef, useState } from 'react';
import { GRAMMAR_CHECK_COMMENT, sealedSpanCovering } from '../core/certification.ts';
import type { ManuscriptDocument } from '../core/document.ts';
import {
  GRAMMAR_SCOPE_LABELS,
  GRAMMAR_SCOPES,
  grammarEditForSuggestion,
  type GrammarLint,
  type GrammarScope,
  type GrammarSuggestionChoice,
} from '../core/grammar.ts';
import { isProseBlock } from '../core/types.ts';

export function GrammarMenu({
  disabled,
  busy,
  onCheck,
}: {
  disabled: boolean;
  busy: boolean;
  onCheck: (scope: GrammarScope) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="grammar-menu" ref={ref}>
      <button
        type="button"
        className="grammar-menu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy}
        onClick={() => setOpen((value) => !value)}
      >
        {busy ? 'Checking…' : 'Grammar'}
      </button>
      {open && (
        <div className="grammar-menu__list" role="menu" aria-label="Grammar check">
          {GRAMMAR_SCOPES.map((scope) => (
            <button
              key={scope}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onCheck(scope);
              }}
            >
              {GRAMMAR_SCOPE_LABELS[scope]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GrammarResults({
  doc,
  lints,
  note,
  onAccept,
  onDismiss,
}: {
  doc: ManuscriptDocument;
  lints: GrammarLint[];
  note: string;
  onAccept: (lint: GrammarLint, suggestion: GrammarSuggestionChoice) => void;
  onDismiss: () => void;
}) {
  if (!lints.length && !note) return null;
  return (
    <section className="grammar-results" aria-label="Grammar suggestions">
      <header>
        <strong>{lints.length ? `${lints.length} grammar ${lints.length === 1 ? 'suggestion' : 'suggestions'}` : 'Grammar'}</strong>
        <span>{GRAMMAR_CHECK_COMMENT}</span>
        <button type="button" className="ghost" onClick={onDismiss}>Dismiss</button>
      </header>
      {note ? <p className="grammar-results__note">{note}</p> : null}
      <ul>
        {lints.map((lint) => {
          const block = doc.blocks.find((item) => item.id === lint.blockId);
          const spans = !block
            ? []
            : isProseBlock(block.type)
              ? doc.provenance[block.id]?.text ?? []
              : doc.provenance[block.id]?.title ?? [];
          const text = !block ? '' : lint.field === 'text' ? block.text : block.title;
          const current = text.slice(lint.start, lint.end) === lint.problem;
          return (
            <li key={lint.id}>
              <p>{lint.message}</p>
              <p className="grammar-results__problem">{lint.problem}</p>
              <div className="grammar-results__actions">
                {lint.suggestions.map((suggestion) => {
                  const edit = grammarEditForSuggestion(lint, suggestion);
                  const sealed = current && sealedSpanCovering(spans, edit.start, edit.end);
                  const label =
                    suggestion.kind === 'remove'
                      ? 'Remove'
                      : suggestion.kind === 'insert-after'
                        ? `Insert “${suggestion.text}”`
                        : `Use “${suggestion.text}”`;
                  return (
                    <button
                      key={`${suggestion.kind}-${suggestion.text}`}
                      type="button"
                      disabled={!sealed}
                      title={sealed ? GRAMMAR_CHECK_COMMENT : 'Only sealed keyboard or dictation text can take a grammar change.'}
                      onClick={() => onAccept(lint, suggestion)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
