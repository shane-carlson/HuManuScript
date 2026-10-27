import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { type CertificationPageIdentity } from '../core/certificationPage.ts';
import { displayTitle, manuscriptStats, type ManuscriptDocument } from '../core/document.ts';
import {
  EPUB_BODY_SIZE_EM,
  EPUB_BODY_SIZE_LABEL,
  type EpubBodySize,
  type EpubChoicePatch,
  type EpubChoiceView,
  type EpubParagraphStyle,
  type EpubTextAlign,
} from '../core/epubSettings.ts';
import { EpubExportError, readEpubImage, type EpubImageSource } from '../core/epubExport.ts';
import {
  EXPORT_FORMAT_LABELS,
  exportCoverFilename,
  exportFilename,
  exportManuscriptBlob,
  SCRIVENER_SPLIT_SEPARATOR,
  type ExportFormat,
} from '../core/exportManuscript.ts';

interface TargetInfo {
  id: string;
  name: string;
  icon: string;
  blurb: string;
  format: ExportFormat;
  steps: ReactNode[];
}

const TARGETS: TargetInfo[] = [
  {
    id: 'word',
    name: 'Microsoft Word',
    icon: '📄',
    blurb: 'A styled .docx with chapter headings, then your manuscript body.',
    format: 'docx',
    steps: [
      'Download the .docx below.',
      'Open it in Word. The first page is the HuManuScript certification summary; a page break starts the manuscript.',
      'Use View → Navigation Pane to jump between chapters.',
    ],
  },
  {
    id: 'scrivener',
    name: 'Scrivener',
    icon: '📝',
    blurb: 'Import and Split on # — one binder document per chapter.',
    format: 'scrivener-rtf',
    steps: [
      'Download the Scrivener import RTF below.',
      'In Scrivener 3 (Mac): File → Import → Import and Split…',
      'Choose the exported .rtf.',
      <>
        Select <b>Split into sections by finding separators in the text</b>. Set the separator to exactly{' '}
        <span className="kbd">{SCRIVENER_SPLIT_SEPARATOR}</span> (a hash on its own line).
      </>,
      'A page break follows the certification summary. The manuscript starts on the next page.',
    ],
  },
  {
    id: 'libreoffice',
    name: 'LibreOffice / OpenOffice',
    icon: '📗',
    blurb: 'Native .odt with headings; certification summary leads the document.',
    format: 'odt',
    steps: [
      'Download the .odt below.',
      'Open it in LibreOffice Writer. The certification summary is its own page, then the manuscript.',
      'Use View → Navigator (F5) to move between chapters.',
    ],
  },
  {
    id: 'rtf',
    name: 'Rich Text',
    icon: '📋',
    blurb: 'Universal .rtf for Pages, WordPad, and other editors.',
    format: 'rtf',
    steps: ['Download the .rtf below.', 'Open in any rich-text editor. A page break follows the certification summary.'],
  },
  {
    id: 'markdown',
    name: 'Markdown',
    icon: '⬇️',
    blurb: 'Portable Markdown with # headings.',
    format: 'markdown',
    steps: ['Download the .md below.', 'A page-break marker follows the certification summary, then the manuscript.'],
  },
  {
    id: 'plaintext',
    name: 'Plain text',
    icon: '🧾',
    blurb: 'Clean .txt for maximum compatibility.',
    format: 'plain',
    steps: ['Download the .txt below.', 'A form feed follows the certification summary so the manuscript starts on the next page.'],
  },
  {
    id: 'pdf',
    name: 'PDF',
    icon: '📕',
    blurb: 'A reading PDF. Print-on-demand still needs a trim-size PDF from another tool.',
    format: 'pdf',
    steps: ['Download the .pdf below.', 'Share or print. The summary is page one; the manuscript starts on the next page.'],
  },
  {
    id: 'epub',
    name: 'E-readers (EPUB)',
    icon: '📚',
    blurb: 'One reflowable EPUB 3 for Kindle, Apple Books, Kobo, and other ebook stores.',
    format: 'epub',
    steps: [
      'Set the author, language, and identifier. Add a JPEG or PNG cover if you have one.',
      'Choose chapter breaks, paragraph style, alignment, and a body size. The EPUB is built from those choices.',
      'Download the .epub. The certification summary is not in this file. If you chose a cover, the same picture is also saved beside it for the store page.',
      'Upload the EPUB to KDP or another ebook channel, and upload the cover separately. Print-on-demand does not use this file.',
    ],
  },
];

const BODY_SIZES: EpubBodySize[] = ['small', 'medium', 'large', 'xlarge'];

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportPane({
  doc,
  bookTitle,
  seriesLabel = null,
  bookId,
  epubChoices,
  onEnsureEpubUuid,
  onSaveEpubChoices,
}: {
  doc: ManuscriptDocument;
  bookTitle?: string;
  seriesLabel?: string | null;
  bookId: string;
  epubChoices: EpubChoiceView;
  onEnsureEpubUuid: () => string;
  onSaveEpubChoices: (patch: EpubChoicePatch) => void;
}) {
  const [target, setTarget] = useState<TargetInfo>(TARGETS[0]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [coverMessage, setCoverMessage] = useState('');
  const [cover, setCover] = useState<(EpubImageSource & { name: string }) | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const [seenBookId, setSeenBookId] = useState(bookId);
  const [form, setForm] = useState<EpubChoicePatch>(() => patchFromView(epubChoices));
  const formRef = useRef(form);
  if (bookId !== seenBookId) {
    const reset = patchFromView(epubChoices);
    formRef.current = reset;
    setSeenBookId(bookId);
    setForm(reset);
    setCover(null);
    setCoverMessage('');
    setExportError('');
    if (coverInput.current) coverInput.current.value = '';
  } else {
    formRef.current = form;
  }
  const ensureRef = useRef(onEnsureEpubUuid);
  ensureRef.current = onEnsureEpubUuid;
  useEffect(() => {
    if (target.format !== 'epub') return;
    ensureRef.current();
  }, [target.format, bookId]);

  const stats = useMemo(() => manuscriptStats(doc.blocks), [doc.blocks]);
  const title = displayTitle(doc);
  const identity = useMemo<CertificationPageIdentity>(
    () => ({ bookTitle: bookTitle || title, seriesLabel }),
    [bookTitle, seriesLabel, title],
  );
  const uuid = epubChoices.uuid;

  const updateForm = (patch: Partial<EpubChoicePatch>, save: boolean) => {
    const next = { ...formRef.current, ...patch };
    formRef.current = next;
    setForm(next);
    if (save) onSaveEpubChoices(next);
  };

  const onCoverFile = async (file: File | undefined) => {
    setCoverMessage('');
    if (!file) {
      setCover(null);
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const image = readEpubImage(bytes, 'cover');
      setCover({ ...image, name: file.name });
    } catch (error) {
      setCover(null);
      if (coverInput.current) coverInput.current.value = '';
      setCoverMessage(error instanceof EpubExportError ? error.message : 'That cover could not be read.');
    }
  };

  const runExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      if (target.format === 'epub') {
        const epubUuid = ensureRef.current();
        const choices = formRef.current;
        const blob = await exportManuscriptBlob(doc, 'epub', new Date().toISOString(), identity, {
          ...choices,
          epubUuid,
          cover: cover ? { bytes: cover.bytes, mediaType: cover.mediaType } : null,
        });
        onSaveEpubChoices(choices);
        downloadBlob(exportFilename(title, 'epub'), blob);
        if (cover) {
          const extension = cover.mediaType === 'image/png' ? 'png' : 'jpg';
          const coverBlob = new Blob([cover.bytes.slice()], { type: cover.mediaType });
          window.setTimeout(() => downloadBlob(exportCoverFilename(title, extension), coverBlob), 400);
        }
      } else {
        const blob = await exportManuscriptBlob(doc, target.format, new Date().toISOString(), identity);
        downloadBlob(exportFilename(title, target.format), blob);
      }
    } catch (error) {
      console.error(error);
      if (error instanceof EpubExportError) setExportError(error.message);
      else window.alert(target.format === 'epub' ? 'EPUB export failed. Check the pictures in the manuscript and try again.' : 'Export failed. Try again or pick another destination.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-pane">
      <div className="export-pane__head">
        <div>
          <h2>Export</h2>
          <p>Guided hand-off to your writing tool, or a reflowable EPUB for ebook stores.</p>
        </div>
        <div className="book-pill">
          <span aria-hidden="true">📖</span>
          <b>{title}</b>
          <span className="book-pill__meta">
            · {stats.chapters} ch · {stats.words} words · {doc.points.length} seal{doc.points.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <p className="export-cert-note">
        Word, RTF, ODT, Markdown, text, and PDF start with the one-page <strong>certification summary</strong>, then a
        page break. The manuscript follows with no certification highlights. <strong>EPUB does not include that summary.</strong>{' '}
        Print-on-demand stays a PDF, not the EPUB.
      </p>

      <div className="stepper" aria-label="Export steps">
        <div className="step is-active"><span className="num">1</span> Choose destination</div>
        <div className="step is-active"><span className="num">2</span> Review steps</div>
        <div className="step is-active"><span className="num">3</span> Export &amp; follow along</div>
      </div>

      <div className="target-grid">
        {TARGETS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`target-card${item.id === target.id ? ' is-selected' : ''}`}
            onClick={() => {
              setTarget(item);
              setExportError('');
            }}
            aria-pressed={item.id === target.id}
          >
            <span className="target-card__ico" aria-hidden="true">{item.icon}</span>
            <h3>{item.name}</h3>
            <p>{item.blurb}</p>
          </button>
        ))}
      </div>

      <div className="export-detail card">
        <h3>Guided steps — {target.name}</h3>
        <p className="sub">Follow along after exporting ({EXPORT_FORMAT_LABELS[target.format]}).</p>
        <ol className="instruction-list">
          {target.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>

        {target.format === 'epub' ? (
          <form
            className="epub-options"
            onSubmit={(event) => {
              event.preventDefault();
              void runExport();
            }}
          >
            <h4>Ebook file</h4>
            <p className="hint">
              These choices are written into the EPUB. The manuscript font and point size stay in the editor. They are not
              embedded.
            </p>
            <div className="epub-grid">
              <label className="field">
                Author
                <input
                  id="epub-author"
                  value={form.author}
                  autoComplete="name"
                  required
                  onChange={(event) => updateForm({ author: event.target.value }, false)}
                  onBlur={(event) => updateForm({ author: event.target.value }, true)}
                />
              </label>
              <label className="field">
                Language
                <input
                  id="epub-language"
                  value={form.language}
                  spellCheck={false}
                  autoCapitalize="off"
                  onChange={(event) => updateForm({ language: event.target.value }, false)}
                  onBlur={(event) => updateForm({ language: event.target.value }, true)}
                />
              </label>
              <label className="field">
                ISBN
                <input
                  id="epub-isbn"
                  value={form.isbn}
                  spellCheck={false}
                  autoCapitalize="off"
                  placeholder="Optional"
                  onChange={(event) => updateForm({ isbn: event.target.value }, false)}
                  onBlur={(event) => updateForm({ isbn: event.target.value }, true)}
                />
              </label>
              <label className="field">
                Body text size
                <select
                  id="epub-body-size"
                  value={form.bodySize}
                  onChange={(event) => updateForm({ bodySize: event.target.value as EpubBodySize }, true)}
                >
                  {BODY_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {EPUB_BODY_SIZE_LABEL[size]} ({EPUB_BODY_SIZE_EM[size]})
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint epub-span">
                Language is a BCP 47 tag, such as en or fr. It should match the language on the store page. Leave ISBN
                blank to use the id saved on this book.
              </p>
              <p className="hint epub-span epub-id-line">
                Saved id{' '}
                <span className="epub-id">{uuid ? `urn:uuid:${uuid}` : 'will be saved on this book'}</span>
                . Downloads reuse it.
              </p>
            </div>

            <fieldset className="epub-span">
              <legend>Chapter page breaks</legend>
              <div className="choice-row">
                <label>
                  <input
                    type="radio"
                    name="epub-chapter-breaks"
                    checked={form.chapterPageBreaks}
                    onChange={() => updateForm({ chapterPageBreaks: true }, true)}
                  />
                  Start each chapter on a new page
                </label>
                <label>
                  <input
                    type="radio"
                    name="epub-chapter-breaks"
                    checked={!form.chapterPageBreaks}
                    onChange={() => updateForm({ chapterPageBreaks: false }, true)}
                  />
                  Continue after the previous chapter
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Paragraphs</legend>
              <div className="choice-row">
                <label>
                  <input
                    type="radio"
                    name="epub-paragraphs"
                    checked={form.paragraphStyle === 'indent'}
                    onChange={() => updateForm({ paragraphStyle: 'indent' satisfies EpubParagraphStyle }, true)}
                  />
                  Indent the first line
                </label>
                <label>
                  <input
                    type="radio"
                    name="epub-paragraphs"
                    checked={form.paragraphStyle === 'spacing'}
                    onChange={() => updateForm({ paragraphStyle: 'spacing' }, true)}
                  />
                  Space between paragraphs
                </label>
              </div>
              <p className="hint">Indent is the usual Kindle novel. Spacing is a small gap, not a blank line.</p>
            </fieldset>

            <fieldset>
              <legend>Text alignment</legend>
              <div className="choice-row">
                <label>
                  <input
                    type="radio"
                    name="epub-align"
                    checked={form.textAlign === 'left'}
                    onChange={() => updateForm({ textAlign: 'left' satisfies EpubTextAlign }, true)}
                  />
                  Left
                </label>
                <label>
                  <input
                    type="radio"
                    name="epub-align"
                    checked={form.textAlign === 'justify'}
                    onChange={() => updateForm({ textAlign: 'justify' }, true)}
                  />
                  Justified
                </label>
              </div>
              <p className="hint">Headings stay left. Justified headings gap out on Kindle.</p>
            </fieldset>

            <label className="field">
              Cover image
              <input
                id="epub-cover"
                ref={coverInput}
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                onChange={(event) => void onCoverFile(event.target.files?.[0])}
              />
            </label>
            {cover ? (
              <p className="hint cover-row">
                <span>{cover.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setCover(null);
                    setCoverMessage('');
                    if (coverInput.current) coverInput.current.value = '';
                  }}
                >
                  Remove cover
                </button>
              </p>
            ) : null}
            <p className="hint">
              JPEG or PNG, RGB, front cover only. A 2560×1600 JPEG under 5 MB also works as the KDP and Ingram store
              page. Body size is a relative step from the reader’s own type size, in em.
            </p>
            {coverMessage ? <p className="export-error" role="alert">{coverMessage}</p> : null}
            {exportError ? <p className="export-error" role="alert">{exportError}</p> : null}
            <button type="submit" className="primary export-download" disabled={exporting}>
              {exporting ? 'Exporting…' : 'Download for E-readers (EPUB)'}
            </button>
          </form>
        ) : (
          <button type="button" className="primary export-download" disabled={exporting} onClick={() => void runExport()}>
            {exporting ? 'Exporting…' : `Download for ${target.name}`}
          </button>
        )}
      </div>
    </div>
  );
}

function patchFromView(view: EpubChoiceView): EpubChoicePatch {
  return {
    author: view.author,
    language: view.language,
    isbn: view.isbn,
    chapterPageBreaks: view.chapterPageBreaks,
    paragraphStyle: view.paragraphStyle,
    textAlign: view.textAlign,
    bodySize: view.bodySize,
  };
}
