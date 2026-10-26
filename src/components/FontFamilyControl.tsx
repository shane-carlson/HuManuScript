import { useEffect, useId, useState } from 'react';
import { addCustomFontFile, installCustomFonts, removeCustomFont } from '../core/customFonts.ts';
import { APPROVED_FONT_TYPE_LABEL } from '../core/fontFile.ts';
import {
  MANUSCRIPT_FONTS,
  extraManuscriptFaces,
  isCustomFontId,
  subscribeExtraFaces,
  type ManuscriptFontFace,
} from '../core/typography.ts';

export function FontFamilyControl({
  fontId,
  onChange,
}: {
  fontId: string;
  onChange: (fontId: string) => void;
}) {
  const inputId = useId();
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
          onChange={(event) => onChange(event.target.value)}
        >
          {choices.map((font) => (
            <option key={font.id} value={font.id}>
              {font.label}
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar-text-btn toolbar-font-add" data-tooltip={`Add a font. ${APPROVED_FONT_TYPE_LABEL}.`}>
        Add font
        <input
          id={inputId}
          className="toolbar-font-file"
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          aria-label="Add a font file"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void onFile(file);
          }}
        />
      </label>
      {isCustomFontId(fontId) && (
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
