import { useEffect, useRef, useState } from 'react';
import { dividerDisplayText } from '../core/manuscript.ts';
import type { DividerStyle } from '../core/types.ts';

export function ManuscriptPageBreak() {
  return (
    <div className="ms-page-break" role="separator" aria-label="Page break">
      <span className="ms-page-break__line" />
      <span className="ms-page-break__label">Page break</span>
      <span className="ms-page-break__line" />
    </div>
  );
}

export function ManuscriptDivider({
  style,
  label,
  onStyleChange,
  onLabelChange,
}: {
  style: DividerStyle;
  label: string;
  onStyleChange: (style: DividerStyle) => void;
  onLabelChange: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const glyph = dividerDisplayText(style, '');
  const word = label.trim();

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [editing]);

  function close() {
    const trimmed = label.trim();
    if (trimmed !== label) onLabelChange(trimmed);
    setEditing(false);
  }

  return (
    <div className="ms-divider-block">
      <div className="ms-divider-block__display" aria-hidden="true">
        {word ? <span className="ms-divider-block__custom">{word}</span> : <span>{glyph}</span>}
      </div>
      <div className="ms-divider-block__tools">
        <span className="ms-divider-block__tool-label">Style</span>
        {(['scene', 'line', 'ornament'] as DividerStyle[]).map((key) => (
          <button
            key={key}
            type="button"
            className={style === key ? 'is-active' : ''}
            onClick={() => onStyleChange(key)}
          >
            {key === 'scene' ? 'Scene * * *' : key === 'line' ? 'Line' : 'Ornament'}
          </button>
        ))}
        <span className="ms-divider-block__label">
          <button
            ref={buttonRef}
            type="button"
            className={word ? 'is-active' : ''}
            aria-expanded={editing}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (editing) close();
              else setEditing(true);
            }}
          >
            Optional label
          </button>
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={label}
              placeholder="Word"
              aria-label="Scene break label"
              onChange={(event) => onLabelChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== 'Escape') return;
                event.preventDefault();
                close();
              }}
              onBlur={(event) => {
                if (event.relatedTarget === buttonRef.current) return;
                close();
              }}
            />
          ) : null}
        </span>
      </div>
    </div>
  );
}
