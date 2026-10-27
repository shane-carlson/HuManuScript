import { useEffect, useState } from 'react';
import type { ManuscriptDocument } from '../core/document.ts';
import { checkEpub, type EpubFinding } from '../core/epubCheck.ts';
import { EpubExportError, readEpubImage, type EpubBuildOptions, type EpubImageSource } from '../core/epubExport.ts';
import {
  EPUB_BODY_SIZE_EM,
  EPUB_BODY_SIZE_LABEL,
  type EpubBodySize,
  type EpubChoicePatch,
  type EpubParagraphStyle,
  type EpubTextAlign,
} from '../core/epubSettings.ts';
import { parseCopyrightYear } from '../core/bookPages.ts';
import { exportCoverFilename, exportFilename, exportManuscriptBlob } from '../core/exportManuscript.ts';
import type { ManuscriptBlock } from '../core/types.ts';

const BODY_SIZES: EpubBodySize[] = ['small', 'medium', 'large', 'xlarge'];

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function EpubExportTab({
  doc,
  title,
  seriesLabel,
  bookId,
  form,
  uuid,
  onUpdate,
  onEnsureUuid,
}: {
  doc: ManuscriptDocument;
  title: string;
  seriesLabel: string | null;
  bookId: string;
  form: EpubChoicePatch;
  uuid: string;
  onUpdate: (patch: Partial<EpubChoicePatch>, save: boolean) => void;
  onEnsureUuid: () => string;
}) {
  const [cover, setCover] = useState<(EpubImageSource & { name: string }) | null>(null);
  const [coverMessage, setCoverMessage] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [check, setCheck] = useState<{ status: 'idle' | 'running' | 'done'; findings: EpubFinding[] }>({
    status: 'idle',
    findings: [],
  });
  const [seenBookId, setSeenBookId] = useState(bookId);
  if (bookId !== seenBookId) {
    setSeenBookId(bookId);
    setCover(null);
    setCoverMessage('');
    setExportError('');
    setCheck({ status: 'idle', findings: [] });
  }

  useEffect(() => {
    setCheck({ status: 'idle', findings: [] });
  }, [doc]);

  const errors = check.findings.filter((item) => item.severity === 'error');
  const warnings = check.findings.filter((item) => item.severity === 'warning');
  const ready = check.status === 'done' && errors.length === 0;

  const buildOptions = (epubUuid: string): EpubBuildOptions => ({
    author: form.author,
    language: form.language,
    isbn: form.ebookIsbn,
    epubUuid,
    cover: cover ? { bytes: cover.bytes, mediaType: cover.mediaType } : null,
    chapterPageBreaks: form.chapterPageBreaks,
    paragraphStyle: form.paragraphStyle,
    textAlign: form.textAlign,
    bodySize: form.bodySize,
    seriesLine: seriesLabel ?? '',
    subtitle: form.subtitle,
    imprint: form.imprint,
    copyrightYear: parseCopyrightYear(form.copyrightYear),
    copyrightHolder: form.copyrightHolder,
    rightsLine: form.rightsLine,
    disclaimer: form.disclaimer,
    edition: form.edition,
    dedication: form.dedication,
    epigraph: form.epigraph,
    epigraphAttribution: form.epigraphAttribution,
    alsoBy: form.alsoBy.map((item) => item.trim()).filter(Boolean),
    aboutAuthor: form.aboutAuthor,
    includePublicationPages: form.includePublicationPages,
  });

  const onCoverFile = async (file: File | undefined) => {
    setCoverMessage('');
    setCheck({ status: 'idle', findings: [] });
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
      setCoverMessage(error instanceof EpubExportError ? error.message : 'That cover could not be read.');
    }
  };

  const runCheck = async () => {
    setCheck({ status: 'running', findings: [] });
    setExportError('');
    const epubUuid = onEnsureUuid();
    const findings = await checkEpub({
      doc,
      options: buildOptions(epubUuid),
      paperbackIsbn: form.paperbackIsbn,
      hardcoverIsbn: form.hardcoverIsbn,
    });
    setCheck({ status: 'done', findings });
  };

  const runDownload = async () => {
    if (!ready) return;
    setExporting(true);
    setExportError('');
    try {
      const epubUuid = onEnsureUuid();
      const options = buildOptions(epubUuid);
      const blob = await exportManuscriptBlob(doc, 'epub', new Date().toISOString(), { bookTitle: title, seriesLabel }, options);
      onUpdate({}, true);
      downloadBlob(exportFilename(title, 'epub'), blob);
      if (cover) {
        const extension = cover.mediaType === 'image/png' ? 'png' : 'jpg';
        const coverBlob = new Blob([cover.bytes.slice()], { type: cover.mediaType });
        window.setTimeout(() => downloadBlob(exportCoverFilename(title, extension), coverBlob), 400);
      }
    } catch (error) {
      console.error(error);
      setExportError(error instanceof EpubExportError ? error.message : 'EPUB export failed. Check the pictures in the manuscript and try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="epub-editor">
      <p className="export-cert-note">
        This file is a reflowable EPUB 3. The certification summary is not in it. Print-on-demand stays a PDF.
      </p>
      <form
        className="epub-options"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) void runDownload();
        }}
      >
        <PublicationSwitch
          id="epub-publication-pages"
          checked={form.includePublicationPages}
          onChange={(includePublicationPages) => onUpdate({ includePublicationPages }, true)}
        />
        <p className="hint">
          Off until you turn it on. On adds a title page, a copyright page, and any dedication, epigraph, also-by, and
          about-the-author text. Contents stays the one page already in the book. No half title and no blank pages. Word,
          PDF, and the other writer files use this same switch, and those files do add a half title.
        </p>

        <section className="epub-section" aria-labelledby="epub-title-heading">
          <h3 id="epub-title-heading">Title page</h3>
          <div className="epub-grid">
            <label className="field">
              Author
              <input
                id="epub-author"
                value={form.author}
                autoComplete="name"
                onChange={(event) => onUpdate({ author: event.target.value }, false)}
                onBlur={(event) => onUpdate({ author: event.target.value }, true)}
              />
            </label>
            <label className="field">
              Subtitle
              <input
                id="epub-subtitle"
                value={form.subtitle}
                placeholder="Leave blank if there is none"
                onChange={(event) => onUpdate({ subtitle: event.target.value }, false)}
                onBlur={(event) => onUpdate({ subtitle: event.target.value }, true)}
              />
            </label>
            <label className="field">
              Imprint
              <input
                id="epub-imprint"
                value={form.imprint}
                placeholder="Leave blank if you have none"
                onChange={(event) => onUpdate({ imprint: event.target.value }, false)}
                onBlur={(event) => onUpdate({ imprint: event.target.value }, true)}
              />
            </label>
            <label className="field">
              Language
              <input
                id="epub-language"
                value={form.language}
                spellCheck={false}
                autoCapitalize="off"
                onChange={(event) => onUpdate({ language: event.target.value }, false)}
                onBlur={(event) => onUpdate({ language: event.target.value }, true)}
              />
            </label>
          </div>
          <p className="hint">
            {seriesLabel
              ? `Series line on the title page: ${seriesLabel}. Change the series from the library list.`
              : 'No series line. A series set on the book is added to the title page.'}{' '}
            The manuscript title is the book title. Subtitle is only what you type here. The imprint is not filled in for you.
          </p>
        </section>

        <section className="epub-section" aria-labelledby="epub-copy-heading">
          <h3 id="epub-copy-heading">Copyright</h3>
          <div className="epub-grid">
            <label className="field">
              Copyright year
              <input
                id="epub-copyright-year"
                value={form.copyrightYear}
                inputMode="numeric"
                placeholder="2026"
                onChange={(event) => onUpdate({ copyrightYear: event.target.value }, false)}
                onBlur={(event) => onUpdate({ copyrightYear: event.target.value }, true)}
              />
            </label>
            <label className="field">
              Copyright holder
              <input
                id="epub-copyright-holder"
                value={form.copyrightHolder}
                placeholder="Same as the author"
                onChange={(event) => onUpdate({ copyrightHolder: event.target.value }, false)}
                onBlur={(event) => onUpdate({ copyrightHolder: event.target.value }, true)}
              />
            </label>
            <label className="field">
              Rights line
              <input
                id="epub-rights"
                value={form.rightsLine}
                placeholder="All rights reserved."
                onChange={(event) => onUpdate({ rightsLine: event.target.value }, false)}
                onBlur={(event) => onUpdate({ rightsLine: event.target.value }, true)}
              />
            </label>
            <label className="field">
              Edition
              <input
                id="epub-edition"
                value={form.edition}
                placeholder="First edition"
                onChange={(event) => onUpdate({ edition: event.target.value }, false)}
                onBlur={(event) => onUpdate({ edition: event.target.value }, true)}
              />
            </label>
            <label className="field epub-span">
              Disclaimer
              <textarea
                id="epub-disclaimer"
                value={form.disclaimer}
                rows={2}
                placeholder="Leave blank for no disclaimer"
                onChange={(event) => onUpdate({ disclaimer: event.target.value }, false)}
                onBlur={(event) => onUpdate({ disclaimer: event.target.value }, true)}
              />
            </label>
            <label className="field">
              Ebook ISBN
              <input
                id="epub-ebook-isbn"
                value={form.ebookIsbn}
                spellCheck={false}
                autoCapitalize="off"
                placeholder="Optional"
                onChange={(event) => onUpdate({ ebookIsbn: event.target.value }, false)}
                onBlur={(event) => onUpdate({ ebookIsbn: event.target.value }, true)}
              />
            </label>
            <label className="field">
              Paperback ISBN
              <input
                id="epub-paperback-isbn"
                value={form.paperbackIsbn}
                spellCheck={false}
                autoCapitalize="off"
                placeholder="Print files only"
                onChange={(event) => onUpdate({ paperbackIsbn: event.target.value }, false)}
                onBlur={(event) => onUpdate({ paperbackIsbn: event.target.value }, true)}
              />
            </label>
            <label className="field">
              Hardcover ISBN
              <input
                id="epub-hardcover-isbn"
                value={form.hardcoverIsbn}
                spellCheck={false}
                autoCapitalize="off"
                placeholder="Print files only"
                onChange={(event) => onUpdate({ hardcoverIsbn: event.target.value }, false)}
                onBlur={(event) => onUpdate({ hardcoverIsbn: event.target.value }, true)}
              />
            </label>
          </div>
          <p className="hint">
            Language is a BCP 47 tag, such as en or fr. Leave the ebook ISBN blank to use the id saved on this book.
            Paperback and hardcover numbers are stored for the print copyright page. They are not written into the EPUB.
          </p>
          <p className="hint epub-id-line">
            Saved id <span className="epub-id">{uuid ? `urn:uuid:${uuid}` : 'will be saved on this book'}</span>. Downloads reuse it.
          </p>
        </section>

        <section className="epub-section" aria-labelledby="epub-pages-heading">
          <h3 id="epub-pages-heading">Other pages</h3>
          <div className="epub-grid">
            <label className="field">
              Dedication
              <textarea
                id="epub-dedication"
                value={form.dedication}
                rows={3}
                placeholder="Leave blank to omit this page"
                onChange={(event) => onUpdate({ dedication: event.target.value }, false)}
                onBlur={(event) => onUpdate({ dedication: event.target.value }, true)}
              />
            </label>
            <label className="field">
              Epigraph
              <textarea
                id="epub-epigraph"
                value={form.epigraph}
                rows={3}
                placeholder="Leave blank to omit this page"
                onChange={(event) => onUpdate({ epigraph: event.target.value }, false)}
                onBlur={(event) => onUpdate({ epigraph: event.target.value }, true)}
              />
            </label>
            <label className="field">
              Epigraph attribution
              <input
                id="epub-epigraph-attribution"
                value={form.epigraphAttribution}
                onChange={(event) => onUpdate({ epigraphAttribution: event.target.value }, false)}
                onBlur={(event) => onUpdate({ epigraphAttribution: event.target.value }, true)}
              />
            </label>
            <label className="field">
              Also by
              <textarea
                id="epub-also-by"
                value={form.alsoBy.join('\n')}
                rows={4}
                placeholder="One title per line"
                onChange={(event) => onUpdate({ alsoBy: event.target.value.split('\n') }, false)}
                onBlur={(event) =>
                  onUpdate(
                    { alsoBy: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) },
                    true,
                  )
                }
              />
            </label>
            <label className="field epub-span">
              About the author
              <textarea
                id="epub-about"
                value={form.aboutAuthor}
                rows={4}
                placeholder="Leave blank to omit this page"
                onChange={(event) => onUpdate({ aboutAuthor: event.target.value }, false)}
                onBlur={(event) => onUpdate({ aboutAuthor: event.target.value }, true)}
              />
            </label>
          </div>
        </section>

        <section className="epub-section" aria-labelledby="epub-reading-heading">
          <h3 id="epub-reading-heading">Reading</h3>
          <p className="hint">
            These choices are written into the EPUB. The manuscript font and point size stay in the editor. They are not embedded.
          </p>
          <label className="field">
            Body text size
            <select
              id="epub-body-size"
              value={form.bodySize}
              onChange={(event) => onUpdate({ bodySize: event.target.value as EpubBodySize }, true)}
            >
              {BODY_SIZES.map((size) => (
                <option key={size} value={size}>
                  {EPUB_BODY_SIZE_LABEL[size]} ({EPUB_BODY_SIZE_EM[size]})
                </option>
              ))}
            </select>
          </label>
          <fieldset id="epub-chapter-breaks" tabIndex={-1}>
            <legend>Chapter page breaks</legend>
            <div className="choice-row">
              <label>
                <input
                  type="radio"
                  name="epub-chapter-breaks"
                  checked={form.chapterPageBreaks}
                  onChange={() => onUpdate({ chapterPageBreaks: true }, true)}
                />
                Start each chapter on a new page
              </label>
              <label>
                <input
                  type="radio"
                  name="epub-chapter-breaks"
                  checked={!form.chapterPageBreaks}
                  onChange={() => onUpdate({ chapterPageBreaks: false }, true)}
                />
                Continue after the previous chapter
              </label>
            </div>
          </fieldset>
          <fieldset id="epub-paragraphs" tabIndex={-1}>
            <legend>Paragraphs</legend>
            <div className="choice-row">
              <label>
                <input
                  type="radio"
                  name="epub-paragraphs"
                  checked={form.paragraphStyle === 'indent'}
                  onChange={() => onUpdate({ paragraphStyle: 'indent' satisfies EpubParagraphStyle }, true)}
                />
                Indent the first line
              </label>
              <label>
                <input
                  type="radio"
                  name="epub-paragraphs"
                  checked={form.paragraphStyle === 'spacing'}
                  onChange={() => onUpdate({ paragraphStyle: 'spacing' }, true)}
                />
                Space between paragraphs
              </label>
            </div>
            <p className="hint">Indent is the usual Kindle novel. Spacing is a small gap, not a blank line.</p>
          </fieldset>
          <fieldset id="epub-align" tabIndex={-1}>
            <legend>Text alignment</legend>
            <div className="choice-row">
              <label>
                <input
                  type="radio"
                  name="epub-align"
                  checked={form.textAlign === 'left'}
                  onChange={() => onUpdate({ textAlign: 'left' satisfies EpubTextAlign }, true)}
                />
                Left
              </label>
              <label>
                <input
                  type="radio"
                  name="epub-align"
                  checked={form.textAlign === 'justify'}
                  onChange={() => onUpdate({ textAlign: 'justify' }, true)}
                />
                Justified
              </label>
            </div>
            <p className="hint">Headings stay left. Justified headings gap out on Kindle.</p>
          </fieldset>
        </section>

        <section className="epub-section" aria-labelledby="epub-cover-heading">
          <h3 id="epub-cover-heading">Cover</h3>
          <label className="field">
            Cover image
            <input
              id="epub-cover"
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
                  setCheck({ status: 'idle', findings: [] });
                }}
              >
                Remove cover
              </button>
            </p>
          ) : null}
          <p className="hint">JPEG or PNG, RGB, front cover only. The cover is chosen again each export. It is not stored in the library.</p>
          {coverMessage ? <p className="export-error" role="alert">{coverMessage}</p> : null}
        </section>

        <section className="epub-section" id="epub-outline" tabIndex={-1} aria-labelledby="epub-outline-heading">
          <h3 id="epub-outline-heading">Pages in this EPUB</h3>
          <SpinePreview doc={doc} form={form} hasCover={!!cover} />
        </section>

        <section className="epub-section" aria-labelledby="epub-check-heading">
          <h3 id="epub-check-heading">Standards check</h3>
          <p className="hint">
            This checks the package, the contents, the stylesheet, and the KDP and Ingram limits this app can see. It is
            not Java EPUBCheck, and it does not open Kindle Previewer. Those stay outside the app. Warnings do not block
            the download.
          </p>
          <button type="button" className="primary" disabled={check.status === 'running'} onClick={() => void runCheck()}>
            {check.status === 'running' ? 'Checking…' : 'Check EPUB'}
          </button>
          <div aria-live="polite">
            {check.status === 'idle' ? <p className="hint">Not checked yet.</p> : null}
            {check.status === 'done' && errors.length === 0 ? (
              <p className="epub-status is-ready">
                {warnings.length
                  ? `No problems that block download. ${warnings.length} ${warnings.length === 1 ? 'note' : 'notes'} to review.`
                  : 'This EPUB passed the checks this app can run.'}
              </p>
            ) : null}
            {check.status === 'done' && errors.length > 0 ? (
              <p className="epub-status is-blocked">
                {errors.length} {errors.length === 1 ? 'problem' : 'problems'} to fix before download.
              </p>
            ) : null}
            {check.findings.length ? (
              <ul className="epub-findings">
                {check.findings.map((finding) => (
                  <li key={finding.code} className={`epub-finding is-${finding.severity}`}>
                    <h4>{finding.title}</h4>
                    <p>{finding.detail}</p>
                    <p>{finding.fix}</p>
                    <button type="button" onClick={() => focusField(finding.focus)}>
                      Show this field
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {exportError ? <p className="export-error" role="alert">{exportError}</p> : null}
          <button type="submit" className="primary export-download" disabled={!ready || exporting}>
            {exporting ? 'Exporting…' : 'Download EPUB'}
          </button>
          {!ready ? <p className="hint">Check this EPUB before download. Download stays off while a check reports a problem.</p> : null}
        </section>
      </form>
    </div>
  );
}

export function PublicationSwitch({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="epub-switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <b>Include publication pages</b>
        <span className="hint"> {checked ? 'On for every file export.' : 'Off. Files stay as they are now.'}</span>
      </span>
    </label>
  );
}

function SpinePreview({ doc, form, hasCover }: { doc: ManuscriptDocument; form: EpubChoicePatch; hasCover: boolean }) {
  const chapters = chapterOutline(doc.blocks);
  if (!form.includePublicationPages) {
    return (
      <>
        <p className="hint">Publication pages are off. This EPUB is the cover if you add one, the contents, and the chapters.</p>
        <ul className="spine-list">
          <li className={hasCover ? '' : 'is-skipped'}>{hasCover ? 'Cover' : 'Cover — not in this file yet'}</li>
          <li>Contents</li>
          {chapters.length ? chapters.map((chapter) => <li key={chapter.title}>{chapter.title}</li>) : <li>The book title, as the only chapter</li>}
        </ul>
      </>
    );
  }
  const rows = [
    hasCover ? 'Cover' : 'Cover — add an image to include it',
    'Title page',
    'Copyright',
    form.dedication.trim() ? 'Dedication' : 'Dedication — omitted until you write one',
    form.epigraph.trim() ? 'Epigraph' : 'Epigraph — omitted until you write one',
    'Contents',
    ...(chapters.length ? chapters.map((chapter) => chapter.title) : ['The book title, as the only chapter']),
    form.alsoBy.some((item) => item.trim()) ? 'Also by' : 'Also by — omitted until you add a title',
    form.aboutAuthor.trim() ? 'About the author' : 'About the author — omitted until you write it',
  ];
  return (
    <ul className="spine-list">
      {rows.map((row) => (
        <li key={row} className={row.includes('omitted') || row.includes('not in') || row.startsWith('Cover —') ? 'is-skipped' : ''}>
          {row}
        </li>
      ))}
    </ul>
  );
}

function chapterOutline(blocks: ManuscriptBlock[]): { title: string; sections: string[] }[] {
  const chapters: { title: string; sections: string[] }[] = [];
  let chapterNo = 0;
  for (const block of blocks) {
    if (block.type === 'chapter') {
      chapterNo += 1;
      chapters.push({ title: block.title.trim() || `Chapter ${chapterNo}`, sections: [] });
    } else if (block.type === 'section' && chapters.length) {
      chapters[chapters.length - 1]!.sections.push(block.title.trim() || 'Section');
    }
  }
  return chapters;
}

function focusField(focus: string) {
  const el = document.getElementById(`epub-${focus}`);
  if (!(el instanceof HTMLElement)) return;
  el.scrollIntoView({ block: 'center' });
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) el.focus();
  else el.focus();
}
