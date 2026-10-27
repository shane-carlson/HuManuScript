import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { ManuscriptDocument } from '../core/document.ts';
import {
  layoutPublication,
  publicationFormat,
  PUBLICATION_FORMATS,
  type PublicationFormatId,
  type PublicationNode,
  type PublicationPage,
} from '../core/publication.ts';
import { styledSpans } from '../core/richText.ts';
import { manuscriptTypographyStyle } from '../core/typography.ts';
import type { InlineMark } from '../core/types.ts';

const FORMAT_KEY = 'humanuscript.publicationFormat';

function loadFormat(): PublicationFormatId {
  try {
    return publicationFormat(sessionStorage.getItem(FORMAT_KEY)).id;
  } catch {
    return 'trade';
  }
}

function saveFormat(id: PublicationFormatId): void {
  try {
    sessionStorage.setItem(FORMAT_KEY, id);
  } catch {
    /* session storage may be unavailable */
  }
}

export function PublicationView({
  doc,
  bookTitle,
  seriesLabel = null,
}: {
  doc: ManuscriptDocument;
  bookTitle?: string;
  seriesLabel?: string | null;
}) {
  const [formatId, setFormatId] = useState<PublicationFormatId>(loadFormat);
  useEffect(() => {
    saveFormat(formatId);
  }, [formatId]);
  const format = publicationFormat(formatId);
  const layout = useMemo(
    () => layoutPublication(doc, format, { bookTitle, seriesLabel }),
    [doc, format, bookTitle, seriesLabel],
  );
  const textPages = layout.pages.filter((page) => page.kind === 'text').length;
  const typeStyle = {
    ...manuscriptTypographyStyle(doc),
    fontFamily: 'var(--ms-font)',
    fontSize: `${format.bodyPt}pt`,
    lineHeight: String(format.lineHeight),
  } as CSSProperties;

  return (
    <section className="publication" aria-label="Publication">
      <div className="export-preview__head">
        <h3>Publication</h3>
        <p>{format.blurb}</p>
      </div>
      <div className="publication__formats" role="group" aria-label="Publication format">
        {PUBLICATION_FORMATS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`publication__format${item.id === format.id ? ' is-active' : ''}`}
            aria-pressed={item.id === format.id}
            onClick={() => setFormatId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="publication__meta">
        {format.trim}
        {format.kind === 'print'
          ? ` · Title page${textPages ? ` and ${textPages} ${textPages === 1 ? 'page' : 'pages'}` : ''}`
          : ' · Reflowable'}
      </p>
      <div className={`publication__stage${format.kind === 'reflow' ? ' is-reflow' : ''}`}>
        {layout.pages.map((page, index) => (
          page.kind === 'screen' ? (
            <ReaderFrame key="screen" page={page} formatId={format.id} style={typeStyle} />
          ) : (
            <PrintPage key={`${page.kind}-${page.number ?? index}`} page={page} format={format} style={typeStyle} />
          )
        ))}
      </div>
    </section>
  );
}

function PrintPage({
  page,
  format,
  style,
}: {
  page: PublicationPage;
  format: ReturnType<typeof publicationFormat>;
  style: CSSProperties;
}) {
  const label = page.kind === 'title' ? 'Title page' : `Page ${page.number}`;
  return (
    <article
      className={`pub-page${page.kind === 'title' ? ' pub-page--title' : ''}`}
      aria-label={label}
      style={{
        ...style,
        ['--pub-w' as string]: String(format.widthIn),
        ['--pub-h' as string]: String(format.heightIn),
      }}
    >
      <p className="pub-page__header">{page.header}</p>
      <div className="pub-page__body">
        {page.kind === 'title' ? <TitleBlock page={page} /> : <Flow nodes={page.nodes} />}
      </div>
      <p className="pub-page__folio">{page.number ?? ''}</p>
    </article>
  );
}

function ReaderFrame({
  page,
  formatId,
  style,
}: {
  page: PublicationPage;
  formatId: PublicationFormatId;
  style: CSSProperties;
}) {
  const tablet = formatId === 'tablet';
  return (
    <div className={`pub-reader${tablet ? ' pub-reader--tablet' : ''}`}>
      <div className="pub-reader__bezel">
        <span>{tablet ? 'Tablet' : 'E-reader'}</span>
        <span>Reflow</span>
      </div>
      <article className="pub-reader__screen" aria-label={tablet ? 'Tablet reader' : 'E-reader'} style={style}>
        <TitleBlock page={page} />
        <Flow nodes={page.nodes} />
      </article>
    </div>
  );
}

function TitleBlock({ page }: { page: PublicationPage }) {
  return (
    <header className="pub-open">
      {page.seriesLabel ? <p className="pub-series">{page.seriesLabel}</p> : null}
      <h2 className="pub-title">{page.title}</h2>
      {page.subtitle ? <p className="pub-subtitle">{page.subtitle}</p> : null}
    </header>
  );
}

function Flow({ nodes }: { nodes: PublicationNode[] }) {
  let seenProse = false;
  return nodes.map((node, index) => {
    if (node.kind === 'chapter' || node.kind === 'section' || node.kind === 'scene' || node.kind === 'ornament' || node.kind === 'gap') {
      seenProse = false;
    }
    const flush = !seenProse;
    if (node.kind === 'paragraph' || node.kind === 'blockquote') seenProse = true;
    return <FlowNode key={nodeKey(node, index)} node={node} flush={flush} />;
  });
}

function nodeKey(node: PublicationNode, index: number): string {
  if ('id' in node && node.id) return node.id;
  if (node.kind === 'chapter') return `chapter-${node.kicker}`;
  return `${node.kind}-${index}`;
}

function FlowNode({ node, flush }: { node: PublicationNode; flush: boolean }) {
  switch (node.kind) {
    case 'chapter':
      return (
        <h3 className="pub-chapter">
          <span className="pub-chapter__kicker">{node.kicker}</span>
          {node.title ? <span className="pub-chapter__title">{node.title}</span> : null}
        </h3>
      );
    case 'section':
      return <h4 className="pub-section">{node.title}</h4>;
    case 'scene':
      return <h4 className="pub-scene">{node.title}</h4>;
    case 'ornament':
      return <p className="pub-ornament">{node.text}</p>;
    case 'gap':
      return <div className="pub-gap" aria-hidden="true" />;
    case 'note':
      return <p className="pub-note">{node.text}</p>;
    case 'blockquote':
      return (
        <blockquote className="pub-quote">
          <Runs text={node.text} marks={node.marks} />
        </blockquote>
      );
    case 'paragraph':
      return (
        <p
          className={`pub-p${flush || node.listStyle ? ' is-flush' : ''}${node.listStyle ? ' is-list' : ''}`}
          style={node.indentLevel ? { marginLeft: `${node.indentLevel * 1.25}em` } : undefined}
        >
          {node.listStyle === 'bullet' ? <span className="pub-marker">•</span> : null}
          {node.listStyle === 'number' && node.listIndex ? <span className="pub-marker">{node.listIndex}.</span> : null}
          <Runs text={node.text} marks={node.marks} />
        </p>
      );
    case 'table':
      return (
        <table className="pub-table">
          <tbody>
            {node.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'image':
      if (!node.src) return <p className="pub-note">[Image: {node.alt || node.caption}]</p>;
      return (
        <figure className="pub-figure">
          <img src={node.src} alt={node.alt || node.caption || ''} />
          {node.caption ? <figcaption>{node.caption}</figcaption> : null}
        </figure>
      );
    default:
      return null;
  }
}

function Runs({ text, marks }: { text: string; marks: InlineMark[] }) {
  return styledSpans(text, marks).map((span, index) => {
    let body: ReactNode = span.text;
    if (span.bold) body = <strong>{body}</strong>;
    if (span.italic) body = <em>{body}</em>;
    if (span.underline) body = <u>{body}</u>;
    if (span.strike) body = <s>{body}</s>;
    return <span key={`${index}-${span.text.slice(0, 8)}`}>{body}</span>;
  });
}
