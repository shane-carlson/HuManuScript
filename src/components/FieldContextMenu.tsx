import { useEffect, useRef } from 'react';
import type { InlineMarkKind } from '../core/types.ts';

export interface ContextMenuState {
  x: number;
  y: number;
  hasSelection: boolean;
  misspelledWord: string | null;
}

export function FieldContextMenu({
  state,
  onClose,
  onCut,
  onCopy,
  onPaste,
  onSelectAll,
  onFormat,
  onClearFormat,
  onBullet,
  onNumber,
  onIndent,
  onOutdent,
  onInsertTable,
  onInsertImage,
  onReplaceWord,
}: {
  state: ContextMenuState | null;
  onClose: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
  onFormat: (kind: InlineMarkKind) => void;
  onClearFormat: () => void;
  onBullet: () => void;
  onNumber: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onInsertTable: () => void;
  onInsertImage: () => void;
  onReplaceWord?: (word: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [state, onClose]);

  if (!state) return null;

  const suggestions = state.misspelledWord
    ? commonSuggestions(state.misspelledWord)
    : [];

  return (
    <div
      ref={ref}
      className="field-context-menu"
      style={{ top: state.y, left: state.x }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {state.hasSelection && (
        <>
          <button type="button" role="menuitem" onClick={() => { onCut(); onClose(); }}>Cut</button>
          <button type="button" role="menuitem" onClick={() => { onCopy(); onClose(); }}>Copy</button>
        </>
      )}
      <button type="button" role="menuitem" onClick={() => { onPaste(); onClose(); }}>Paste</button>
      <button type="button" role="menuitem" onClick={() => { onSelectAll(); onClose(); }}>Select all</button>
      <div className="field-context-menu__sep" />
      <button type="button" role="menuitem" onClick={() => { onFormat('bold'); onClose(); }}>Bold</button>
      <button type="button" role="menuitem" onClick={() => { onFormat('italic'); onClose(); }}>Italic</button>
      <button type="button" role="menuitem" onClick={() => { onFormat('underline'); onClose(); }}>Underline</button>
      <button type="button" role="menuitem" onClick={() => { onFormat('strike'); onClose(); }}>Strikethrough</button>
      <button type="button" role="menuitem" onClick={() => { onClearFormat(); onClose(); }}>Clear formatting</button>
      <div className="field-context-menu__sep" />
      <button type="button" role="menuitem" onClick={() => { onBullet(); onClose(); }}>Bullet list</button>
      <button type="button" role="menuitem" onClick={() => { onNumber(); onClose(); }}>Numbered list</button>
      <button type="button" role="menuitem" onClick={() => { onIndent(); onClose(); }}>Increase indent</button>
      <button type="button" role="menuitem" onClick={() => { onOutdent(); onClose(); }}>Decrease indent</button>
      <div className="field-context-menu__sep" />
      <button type="button" role="menuitem" onClick={() => { onInsertTable(); onClose(); }}>Insert table…</button>
      <button type="button" role="menuitem" onClick={() => { onInsertImage(); onClose(); }}>Insert image…</button>
      {state.misspelledWord && (
        <>
          <div className="field-context-menu__sep" />
          <p className="field-context-menu__hint">Spelling: {state.misspelledWord}</p>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              onClick={() => {
                onReplaceWord?.(s);
                onClose();
              }}
            >
              Replace with “{s}”
            </button>
          ))}
          <p className="field-context-menu__hint">Red underlines use your system spell checker.</p>
        </>
      )}
    </div>
  );
}

function commonSuggestions(word: string): string[] {
  const lower = word.toLowerCase();
  const map: Record<string, string[]> = {
    teh: ['the'],
    recieve: ['receive'],
    occured: ['occurred'],
    seperate: ['separate'],
    definately: ['definitely'],
    untill: ['until'],
  };
  return map[lower] ?? [];
}
