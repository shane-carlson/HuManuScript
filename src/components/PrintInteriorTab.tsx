import { useEffect, useMemo, useState } from 'react';
import compilerWasm from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm?url';
import rendererWasm from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm?url';
import boldUrl from '../fonts/CrimsonText-Bold.ttf?url';
import boldItalicUrl from '../fonts/CrimsonText-BoldItalic.ttf?url';
import italicUrl from '../fonts/CrimsonText-Italic.ttf?url';
import regularUrl from '../fonts/CrimsonText-Regular.ttf?url';
import type { ManuscriptDocument } from '../core/document.ts';
import type { PublicationFileOptions } from '../core/exportManuscript.ts';
import {
  DEFAULT_PRINT_TRIM_ID,
  gutterBandLabel,
  printInteriorFilename,
  printInteriorRefusal,
  printSheetWarnings,
  PRINT_TRIMS,
} from '../core/printInterior.ts';
import { otherBindingSizes, PUBLICATION_FORMATS, publicationFormat, type PublicationFormat, type PublicationFormatId } from '../core/publication.ts';
import { compilePrintInterior, configurePrintTypstWasm, printPreviewSvg, type CompiledPrintInterior } from '../core/printTypst.ts';
import type { EpubChoicePatch } from '../core/epubSettings.ts';
import { PublicationSwitch } from './EpubExportTab.tsx';

configurePrintTypstWasm({ compiler: compilerWasm, renderer: rendererWasm });

const FONT_URLS = [regularUrl, italicUrl, boldUrl, boldItalicUrl];

let fontBytes: Promise<Uint8Array[]> | null = null;

function loadFonts(): Promise<Uint8Array[]> {
  if (!fontBytes) {
    fontBytes = Promise.all(
      FONT_URLS.map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Crimson Text could not be loaded for the print interior.');
        return new Uint8Array(await response.arrayBuffer());
      }),
    );
  }
  return fontBytes;
}

function downloadBytes(filename: string, bytes: Uint8Array) {
  const blob = new Blob([bytes.slice()], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function PrintInteriorTab({
  doc,
  title,
  seriesLabel,
  form,
  onUpdate,
}: {
  doc: ManuscriptDocument;
  title: string;
  seriesLabel: string | null;
  form: EpubChoicePatch;
  onUpdate: (patch: Partial<EpubChoicePatch>, save: boolean) => void;
}) {
  const [formatId, setFormatId] = useState<PublicationFormatId>(DEFAULT_PRINT_TRIM_ID);
  const [openSizes, setOpenSizes] = useState<'paperback' | 'hardcover' | null>(null);
  const [compiled, setCompiled] = useState<CompiledPrintInterior | null>(null);
  const [status, setStatus] = useState<'idle' | 'working' | 'ready' | 'blocked' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  const options = useMemo<PublicationFileOptions>(
    () => ({
      includePublicationPages: form.includePublicationPages,
      author: form.author,
      subtitle: form.subtitle,
      imprint: form.imprint,
      copyrightYear: form.copyrightYear,
      copyrightHolder: form.copyrightHolder,
      rightsLine: form.rightsLine,
      disclaimer: form.disclaimer,
      paperbackIsbn: form.paperbackIsbn,
      hardcoverIsbn: form.hardcoverIsbn,
      ebookIsbn: form.ebookIsbn,
      edition: form.edition,
      dedication: form.dedication,
      epigraph: form.epigraph,
      epigraphAttribution: form.epigraphAttribution,
      alsoBy: form.alsoBy,
      aboutAuthor: form.aboutAuthor,
      seriesLine: seriesLabel ?? '',
    }),
    [form, seriesLabel],
  );

  const trim = PRINT_TRIMS.find((item) => item.id === formatId) ?? PRINT_TRIMS[0]!;
  const refusal = printInteriorRefusal(doc, options, formatId);

  useEffect(() => {
    if (!openSizes) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!(target instanceof Element) || !target.closest('.publication__formats')) setOpenSizes(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenSizes(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [openSizes]);

  useEffect(() => {
    if (refusal) return;
    let cancel = false;
    const timer = window.setTimeout(() => {
      setStatus('working');
      setMessage('Setting the type…');
      void (async () => {
        try {
          const fonts = await loadFonts();
          const next = await compilePrintInterior(doc, options, formatId, fonts, form.language);
          if (cancel) return;
          setCompiled(next);
          setStatus('ready');
          setMessage('');
        } catch (error) {
          if (cancel) return;
          setCompiled(null);
          setStatus('error');
          setMessage(error instanceof Error ? error.message : 'The print interior could not be compiled.');
        }
      })();
    }, 200);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [doc, options, formatId, form.language, refusal]);

  useEffect(() => {
    if (!compiled || refusal) return;
    const url = URL.createObjectURL(new Blob([printPreviewSvg(compiled.svg)], { type: 'image/svg+xml' }));
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPreviewUrl('');
    };
  }, [compiled, refusal]);

  const viewStatus = refusal ? 'blocked' : status;
  const viewMessage = refusal ?? message;
  const live = refusal ? null : compiled;
  const warnings = live ? printSheetWarnings(live.trim, live.sheets) : [];
  const filename = printInteriorFilename(title, trim);

  return (
    <div className="print-interior">
      <p className="export-cert-note">
        This is the trim-size interior. The page you see is the file you download. The letter-size PDF on Writer files
        stays the reading copy, and the certification summary is not in this one.
      </p>

      <div className="publication__formats" role="group" aria-label="Trim size">
        {PUBLICATION_FORMATS.filter((item) => item.button && item.kind === 'print').map((item) => {
          const sizes = item.binding === 'paperback' || item.binding === 'hardcover' ? otherBindingSizes(item.binding) : [];
          const active = formatId === item.id || sizes.some((size) => size.id === formatId);
          return (
            <TrimChoice
              key={item.id}
              item={item}
              active={active}
              sizes={sizes}
              open={sizes.length > 0 && openSizes === item.binding}
              selectedId={formatId}
              onSelect={(id) => {
                setFormatId(id);
                setOpenSizes(null);
              }}
              onToggle={() => {
                const binding = item.binding;
                if (binding !== 'paperback' && binding !== 'hardcover') return;
                setOpenSizes((current) => (current === binding ? null : binding));
              }}
            />
          );
        })}
      </div>

      <p className="print-interior__note">{trim.note}</p>
      <p className="hint">
        Body {publicationFormat(trim.id).bodyPt} pt, Crimson Text. Italic and bold are the font files. No bleed, no crop
        marks. Author, year, ISBN, dedication, and the other pages are shared with the EPUB tab.
      </p>

      <PublicationSwitch
        id="print-publication-pages"
        checked={form.includePublicationPages}
        onChange={(includePublicationPages) => onUpdate({ includePublicationPages }, true)}
      />
      <div className="epub-grid">
        <label className="field">
          Author
          <input
            id="print-author"
            value={form.author}
            autoComplete="name"
            onChange={(event) => onUpdate({ author: event.target.value }, false)}
            onBlur={(event) => onUpdate({ author: event.target.value }, true)}
          />
        </label>
        <label className="field">
          Copyright year
          <input
            id="print-year"
            value={form.copyrightYear}
            inputMode="numeric"
            placeholder="Four digits"
            onChange={(event) => onUpdate({ copyrightYear: event.target.value }, false)}
            onBlur={(event) => onUpdate({ copyrightYear: event.target.value }, true)}
          />
        </label>
      </div>

      <div className="print-interior__stage">
        <div className="print-interior__proof" aria-busy={viewStatus === 'working'}>
          {previewUrl && viewStatus === 'ready' ? (
            <img src={previewUrl} alt={`Print interior of ${title}, ${trim.fileLabel}`} />
          ) : (
            <p className="print-interior__wait">{viewStatus === 'working' ? 'Setting the type…' : 'The proof appears here when the interior can be set.'}</p>
          )}
        </div>
        <aside className="print-interior__meta" aria-label="Sheet count">
          <p>
            <b>{trim.fileLabel}</b>
            {trim.id === 'mass-market' ? ' · Lulu pocket' : ''}
          </p>
          {live && viewStatus === 'ready' ? (
            <>
              <p>
                {live.sheets} {live.sheets === 1 ? 'sheet' : 'sheets'}, including blanks. Folios start at 1 on
                chapter 1. Front matter is unnumbered.
              </p>
              <p>{gutterBandLabel(live.sheets)}</p>
              <p>The file is not padded to an even count. KDP rounds an odd file up. Ingram adds its manufacturing page.</p>
            </>
          ) : (
            <p>{viewStatus === 'working' ? 'Counting sheets…' : 'Sheet count appears with the proof.'}</p>
          )}
          {warnings.map((warning) => (
            <p key={warning} className="export-error" role="status">{warning}</p>
          ))}
          {viewMessage && viewStatus !== 'ready' ? (
            <p className="export-error" role="alert">{viewMessage}</p>
          ) : null}
          <button
            type="button"
            className="primary export-download"
            disabled={!live || viewStatus !== 'ready'}
            onClick={() => {
              if (live) downloadBytes(printInteriorFilename(title, live.trim), live.pdf);
            }}
          >
            {viewStatus === 'working' ? 'Setting the type…' : 'Download print interior'}
          </button>
          <p className="hint">{filename}</p>
        </aside>
      </div>
    </div>
  );
}

function TrimChoice({
  item,
  active,
  sizes,
  open,
  selectedId,
  onSelect,
  onToggle,
}: {
  item: PublicationFormat;
  active: boolean;
  sizes: readonly PublicationFormat[];
  open: boolean;
  selectedId: PublicationFormatId;
  onSelect: (id: PublicationFormatId) => void;
  onToggle: () => void;
}) {
  const sized = sizes.length > 0;
  return (
    <div className={`publication__format-group${active ? ' is-active' : ''}${open ? ' is-open' : ''}${sized ? ' has-sizes' : ''}`}>
      <button type="button" className="publication__format" aria-pressed={active} onClick={() => onSelect(item.id)}>
        {item.label}
      </button>
      {sized && (
        <button
          type="button"
          className="publication__format-chevron"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={item.binding === 'paperback' ? 'Other trade paperback sizes' : 'Other hardcover sizes'}
          onClick={onToggle}
        />
      )}
      {open && (
        <div className="publication__sizes" role="menu" aria-label={`${item.label} sizes`}>
          {sizes.map((size) => (
            <button
              key={size.id}
              type="button"
              role="menuitemradio"
              aria-checked={size.id === selectedId}
              className={size.id === selectedId ? 'is-active' : undefined}
              onClick={() => onSelect(size.id)}
            >
              {size.trim}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
