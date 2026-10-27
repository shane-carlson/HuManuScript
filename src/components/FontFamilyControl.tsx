import { useEffect, useId, useRef, useState } from 'react';
import { IconRemoveFont, ToolbarIconButton } from './ManuscriptToolbarIcons.tsx';
import { addCustomFontFile, installCustomFonts, removeCustomFont } from '../core/customFonts.ts';
import { APPROVED_FONT_TYPE_LABEL } from '../core/fontFile.ts';
import {
  MANUSCRIPT_FONTS,
  extraManuscriptFaces,
  isCustomFontId,
  subscribeExtraFaces,
  type ManuscriptFontFace,
} from '../core/typography.ts';

const ADD_FONT = '__add-font__';

export function FontFamilyControl({
  fontId,
  onChange,
  compact = false,
}: {
  fontId: string;
  onChange: (fontId: string) => void;
  compact?: boolean;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [added, setAdded] = useState<readonly ManuscriptFontFace[]>(() => extraManuscriptFaces());
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    void installCustomFonts().then((faces) => {
      if (!cancel) setAdded(faces);
    });
    const unsubscribe = subscribeExtraFaces(() => {
      if (!cancel) setAdded(extraManuscriptFaces());
    });
    return () => {
      cancel = true;
      unsubscribe();
    };
  }, []);

  const choices = choicesFor(fontId, added);
  const selected = choices.find((font) => font.id === fontId) ?? choices[0];

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await addCustomFontFile(file);
      if (!result.ok) {
        setMessageIsError(true);
        setMessage(result.message);
        return;
      }
      setAdded(extraManuscriptFaces());
      setMessageIsError(false);
      setMessage(`Added ${result.face.label}.`);
      onChange(result.face.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label className="toolbar-font toolbar-font--family" data-tooltip="Font">
        <select
          aria-label="Font"
          value={selected?.id ?? 'palatino'}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.value;
            if (next === ADD_FONT) {
              event.target.value = selected?.id ?? 'palatino';
              fileRef.current?.click();
              return;
            }
            onChange(next);
          }}
        >
          <option value={ADD_FONT}>Add font</option>
          {choices.map((font) => (
            <option key={font.id} value={font.id}>
              {font.label}
            </option>
          ))}
        </select>
      </label>
      <input
        ref={fileRef}
        id={inputId}
        className="toolbar-font-file"
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        aria-label="Add a font file"
        tabIndex={-1}
        disabled={busy}
        title={APPROVED_FONT_TYPE_LABEL}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void onFile(file);
        }}
      />
      {isCustomFontId(fontId) && (
        compact ? (
          <ToolbarIconButton
            label="Remove font"
            disabled={busy}
            onClick={() => {
              void removeCustomFont(fontId).then(() => {
                setAdded(extraManuscriptFaces());
                setMessageIsError(false);
                setMessage('Removed the added font.');
                onChange('palatino');
              });
            }}
          >
            <IconRemoveFont />
          </ToolbarIconButton>
        ) : (
        <button
          type="button"
          className="toolbar-text-btn"
          disabled={busy}
          onClick={() => {
            void removeCustomFont(fontId).then(() => {
              setAdded(extraManuscriptFaces());
              setMessageIsError(false);
              setMessage('Removed the added font.');
              onChange('palatino');
            });
          }}
        >
          Remove font
        </button>
        )
      )}
      {message && (
        <p className={`toolbar-font-note${messageIsError ? ' is-error' : ''}`} role="status">
          {message}
        </p>
      )}
    </>
  );
}

function choicesFor(fontId: string, added: readonly ManuscriptFontFace[]): ManuscriptFontFace[] {
  const choices: ManuscriptFontFace[] = [...MANUSCRIPT_FONTS, ...added];
  if (isCustomFontId(fontId) && !choices.some((font) => font.id === fontId)) {
    choices.push({
      id: fontId,
      label: 'Added font',
      css: 'Palatino, Georgia, serif',
      exportName: 'Palatino',
      pdfFont: 'times',
      rtfFamily: '\\froman',
    });
  }
  return choices;
}
