import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SessionCaptureExport } from './SessionCapture.tsx';
import { type CertificationPageIdentity } from '../core/certificationPage.ts';
import { displayTitle, manuscriptStats, type ManuscriptDocument } from '../core/document.ts';
import { PrintInteriorTab } from './PrintInteriorTab.tsx';
import { EpubExportError } from '../core/epubExport.ts';
import { type EpubChoicePatch, type EpubChoiceView } from '../core/epubSettings.ts';
import {
  EXPORT_FORMAT_LABELS,
  exportFilename,
  exportManuscriptBlob,
  SCRIVENER_SPLIT_SEPARATOR,
  type ExportFormat,
  type PublicationFileOptions,
} from '../core/exportManuscript.ts';
import { PublicationPagesError } from '../core/publicationPages.ts';
import { EpubExportTab, PublicationSwitch } from './EpubExportTab.tsx';

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
    blurb: 'A letter-size reading PDF. The certification summary is page one. The trim-size file is the Print interior tab.',
    format: 'pdf',
    steps: ['Download the .pdf below.', 'Share or print. The summary is page one; the manuscript starts on the next page.'],
  },
];

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
  const [panel, setPanel] = useState<'files' | 'epub' | 'print'>('files');
  const [printOpened, setPrintOpened] = useState(false);
  const [target, setTarget] = useState<TargetInfo>(TARGETS[0]!);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [seenBookId, setSeenBookId] = useState(bookId);
  const [form, setForm] = useState<EpubChoicePatch>(() => patchFromView(epubChoices));
  const formRef = useRef(form);
  if (bookId !== seenBookId) {
    const reset = patchFromView(epubChoices);
    formRef.current = reset;
    setSeenBookId(bookId);
    setForm(reset);
    setExportError('');
  } else {
    formRef.current = form;
  }
  const ensureRef = useRef(onEnsureEpubUuid);
  ensureRef.current = onEnsureEpubUuid;
  useEffect(() => {
    if (panel !== 'epub') return;
    ensureRef.current();
  }, [panel, bookId]);

  const stats = useMemo(() => manuscriptStats(doc.blocks), [doc.blocks]);
  const title = displayTitle(doc);
  const identity = useMemo<CertificationPageIdentity>(
    () => ({ bookTitle: bookTitle || title, seriesLabel }),
    [bookTitle, seriesLabel, title],
  );

  const updateForm = (patch: Partial<EpubChoicePatch>, save: boolean) => {
    const next = { ...formRef.current, ...patch };
    formRef.current = next;
    setForm(next);
    if (save) onSaveEpubChoices(next);
  };

  const publication = (): PublicationFileOptions => ({
    includePublicationPages: formRef.current.includePublicationPages,
    author: formRef.current.author,
    subtitle: formRef.current.subtitle,
    imprint: formRef.current.imprint,
    copyrightYear: formRef.current.copyrightYear,
    copyrightHolder: formRef.current.copyrightHolder,
    rightsLine: formRef.current.rightsLine,
    disclaimer: formRef.current.disclaimer,
    paperbackIsbn: formRef.current.paperbackIsbn,
    hardcoverIsbn: formRef.current.hardcoverIsbn,
    ebookIsbn: formRef.current.ebookIsbn,
    edition: formRef.current.edition,
    dedication: formRef.current.dedication,
    epigraph: formRef.current.epigraph,
    epigraphAttribution: formRef.current.epigraphAttribution,
    alsoBy: formRef.current.alsoBy,
    aboutAuthor: formRef.current.aboutAuthor,
    seriesLine: seriesLabel ?? '',
  });

  const runExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const blob = await exportManuscriptBlob(
        doc,
        target.format,
        new Date().toISOString(),
        identity,
        undefined,
        publication(),
      );
      if (formRef.current.includePublicationPages) onSaveEpubChoices(formRef.current);
      downloadBlob(exportFilename(title, target.format), blob);
    } catch (error) {
      console.error(error);
      if (error instanceof PublicationPagesError || error instanceof EpubExportError) setExportError(error.message);
      else window.alert('Export failed. Try again or pick another destination.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-pane">
      <div className="export-pane__head">
        <div>
          <h2>Export</h2>
          <p>Writer files keep the certification summary. EPUB is the reflowable ebook. Print interior is the trim-size PDF.</p>
        </div>
        <BookGrid
          title={title}
          author={form.author}
          seriesLabel={seriesLabel}
          words={stats.words}
          chapters={stats.chapters}
          scenes={stats.scenes}
          sections={stats.sections}
          seals={doc.points.length}
        />
      </div>

      <div className="export-tabs" role="tablist" aria-label="Export">
        <button
          type="button"
          role="tab"
          id="export-tab-files"
          aria-selected={panel === 'files'}
          aria-controls="export-panel-files"
          tabIndex={panel === 'files' ? 0 : -1}
          className={panel === 'files' ? 'is-active' : ''}
          onClick={() => setPanel('files')}
        >
          Writer files
        </button>
        <button
          type="button"
          role="tab"
          id="export-tab-epub"
          aria-selected={panel === 'epub'}
          aria-controls="export-panel-epub"
          tabIndex={panel === 'epub' ? 0 : -1}
          className={panel === 'epub' ? 'is-active' : ''}
          onClick={() => setPanel('epub')}
        >
          EPUB
        </button>
        <button
          type="button"
          role="tab"
          id="export-tab-print"
          aria-selected={panel === 'print'}
          aria-controls="export-panel-print"
          tabIndex={panel === 'print' ? 0 : -1}
          className={panel === 'print' ? 'is-active' : ''}
          onClick={() => {
            setPrintOpened(true);
            setPanel('print');
          }}
        >
          Print interior
        </button>
      </div>

      <div role="tabpanel" id="export-panel-files" aria-labelledby="export-tab-files" hidden={panel !== 'files'}>
        <p className="export-cert-note">
          Word, RTF, ODT, Markdown, text, and PDF start with the one-page <strong>certification summary</strong>, then a
          page break. The manuscript follows with no certification highlights. Publication pages stay off until you turn
          them on.
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
          <PublicationSwitch
            id="writer-publication-pages"
            checked={form.includePublicationPages}
            onChange={(includePublicationPages) => updateForm({ includePublicationPages }, true)}
          />
          <p className="hint">
            When this is on, the file adds a half title, title page, copyright page, contents, and any dedication,
            epigraph, also-by list, and about-the-author text from the EPUB tab. The certification summary still leads.
            Fill in the author and copyright year on the EPUB tab first.
          </p>
          {exportError ? <p className="export-error" role="alert">{exportError}</p> : null}
          <button type="button" className="primary export-download" disabled={exporting} onClick={() => void runExport()}>
            {exporting ? 'Exporting…' : `Download for ${target.name}`}
          </button>
        </div>
      </div>

      <div role="tabpanel" id="export-panel-epub" aria-labelledby="export-tab-epub" hidden={panel !== 'epub'}>
        <EpubExportTab
          doc={doc}
          title={title}
          seriesLabel={seriesLabel}
          bookId={bookId}
          form={form}
          uuid={epubChoices.uuid}
          onUpdate={updateForm}
          onEnsureUuid={onEnsureEpubUuid}
        />
      </div>

      {printOpened ? (
        <div role="tabpanel" id="export-panel-print" aria-labelledby="export-tab-print" hidden={panel !== 'print'}>
          <PrintInteriorTab
            doc={doc}
            title={title}
            seriesLabel={seriesLabel}
            form={form}
            onUpdate={updateForm}
          />
        </div>
      ) : null}

      <SessionCaptureExport doc={doc} title={title} />
    </div>
  );
}

function BookGrid({
  title,
  author,
  seriesLabel,
  words,
  chapters,
  scenes,
  sections,
  seals,
}: {
  title: string;
  author: string;
  seriesLabel: string | null;
  words: number;
  chapters: number;
  scenes: number;
  sections: number;
  seals: number;
}) {
  const cells = [
    ['Title', title],
    ['Author', author.trim() || 'Not set'],
    ['Series', seriesLabel || 'Standalone'],
    ['Words', String(words)],
    ['Chapters', String(chapters)],
    ['Scenes', String(scenes)],
    ['Sections', String(sections)],
    ['Seals', String(seals)],
  ];
  return (
    <dl className="export-book-grid" aria-label="This book">
      {cells.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function patchFromView(view: EpubChoiceView): EpubChoicePatch {
  const { uuid, ...patch } = view;
  void uuid;
  return { ...patch, alsoBy: [...patch.alsoBy] };
}
