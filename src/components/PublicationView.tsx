import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ManuscriptDocument } from '../core/document.ts';
import {
  layoutPublication,
  packPublication,
  otherBindingSizes,
  publicationFormat,
  PUBLICATION_FORMATS,
  type PublicationFormat,
  type PublicationFormatId,
  type PublicationLayout,
  type PublicationNode,
  type PublicationPage,
} from '../core/publication.ts';
import { flowFitsBody, renderPublicationFlow } from './publicationMeasure.ts';
import { styledSpans } from '../core/richText.ts';
import { manuscriptTypographyStyle } from '../core/typography.ts';
import type { InlineMark } from '../core/types.ts';

const FORMAT_KEY = 'humanuscript.publicationFormat';
const READER_SIZE_KEY = 'humanuscript.publicationReaderSize';
const READER_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28];

function loadReaderSize(fallback: number): number {
  try {
    const saved = Number(sessionStorage.getItem(READER_SIZE_KEY));
    if (READER_SIZES.includes(saved)) return saved;
  } catch {
    /* session storage may be unavailable */
  }
  return READER_SIZES.reduce((best, size) => Math.abs(size - fallback) < Math.abs(best - fallback) ? size : best, READER_SIZES[0]!);
}

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

function pagesKey(layout: PublicationLayout): string {
  return layout.pages.map((page) => {
    const body = page.nodes.map((node) => {
      if (node.kind === 'paragraph' || node.kind === 'blockquote') return `${node.kind}:${node.id}:${node.text}`;
      if (node.kind === 'chapter') return `chapter:${node.kicker}:${node.title}`;
      if (node.kind === 'section' || node.kind === 'scene') return `${node.kind}:${node.title}`;
      if (node.kind === 'ornament' || node.kind === 'note') return `${node.kind}:${node.text}`;
      if (node.kind === 'table') return `table:${node.id}:${node.rows.length}`;
      if (node.kind === 'image') return `image:${node.id}:${node.caption}:${node.src.length}`;
      return node.kind;
    }).join('\n');
    return `${page.kind}|${page.number ?? ''}|${page.header}|${body}`;
  }).join('\f');
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
  const [readerSize, setReaderSize] = useState(() => loadReaderSize(13));
  const [openSizes, setOpenSizes] = useState<'paperback' | 'hardcover' | null>(null);
  const formatsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    saveFormat(formatId);
  }, [formatId]);
  useEffect(() => {
    try {
      sessionStorage.setItem(READER_SIZE_KEY, String(readerSize));
    } catch {
      /* session storage may be unavailable */
    }
  }, [readerSize]);
  useEffect(() => {
    if (!openSizes) return;
    const close = (event: MouseEvent) => {
      if (!formatsRef.current?.contains(event.target as Node)) setOpenSizes(null);
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
  const format = publicationFormat(formatId);
  const bodyPt = format.kind === 'reader' ? readerSize : format.bodyPt;
  const typography = manuscriptTypographyStyle(doc);
  const typeStyle = {
    ...typography,
    fontFamily: 'var(--ms-font)',
    fontSize: `${bodyPt}pt`,
    lineHeight: String(format.lineHeight),
  } as CSSProperties;
  const [packed, setPacked] = useState<{ layout: PublicationLayout; mode: 'measured' | 'estimated' }>(() => ({
    layout: layoutPublication(doc, format, { bookTitle, seriesLabel }, bodyPt),
    mode: 'estimated',
  }));
  const pageRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLParagraphElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const folioRef = useRef<HTMLParagraphElement>(null);
  const packing = useRef(false);
  const measureKey = [
    format.id,
    format.widthIn,
    format.heightIn,
    format.marginXIn,
    format.marginYIn,
    format.lineHeight,
    bodyPt,
    typography['--ms-font'],
    bookTitle ?? '',
    seriesLabel ?? '',
  ].join('|');
  useLayoutEffect(() => {
    let cancelled = false;
    const apply = (layout: PublicationLayout, mode: 'measured' | 'estimated') => {
      if (cancelled) return;
      setPacked((prev) => (prev.mode === mode && pagesKey(prev.layout) === pagesKey(layout) ? prev : { layout, mode }));
    };
    const measure = () => {
      if (cancelled || packing.current) return;
      const body = bodyRef.current;
      const flow = flowRef.current;
      const header = headerRef.current;
      const folio = folioRef.current;
      const estimated = layoutPublication(doc, format, { bookTitle, seriesLabel }, bodyPt);
      if (!body || !flow || !header || !folio || body.clientHeight < 40 || body.clientWidth < 40) {
        apply(estimated, 'estimated');
        return;
      }
      packing.current = true;
      try {
        const layout = packPublication(doc, format, { bookTitle, seriesLabel }, (nodes, slot) => {
          header.textContent = slot.header;
          folio.textContent = String(slot.number);
          renderPublicationFlow(flow, nodes);
          return flowFitsBody(body, flow);
        });
        apply(layout, 'measured');
      } finally {
        packing.current = false;
      }
    };
    measure();
    const fonts = document.fonts;
    const onFonts = () => measure();
    fonts?.addEventListener('loadingdone', onFonts);
    void fonts?.ready.then(onFonts);
    const body = bodyRef.current;
    const observer = body ? new ResizeObserver(() => measure()) : null;
    if (body) observer?.observe(body);
    const root = pageRef.current?.closest('.publication');
    const onLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement) measure();
    };
    root?.addEventListener('load', onLoad, true);
    return () => {
      cancelled = true;
      fonts?.removeEventListener('loadingdone', onFonts);
      observer?.disconnect();
      root?.removeEventListener('load', onLoad, true);
    };
  }, [doc, format, bookTitle, seriesLabel, bodyPt, measureKey]);
  const layout = packed.layout;
  const textPages = layout.pages.filter((page) => page.kind === 'text').length;

  return (
    <section className="publication" data-pack={packed.mode} aria-label="Publication">
      <div className="pub-measure" aria-hidden="true">
        <article ref={pageRef} className="pub-page" style={{ ...typeStyle, ...pageBox(format) }}>
          <p className="pub-page__header" ref={headerRef} />
          <div className="pub-page__body" ref={bodyRef}>
            <div className="pub-page__flow" ref={flowRef} />
          </div>
          <p className="pub-page__folio" ref={folioRef} />
        </article>
      </div>
      <div className="export-preview__head">
        <h3>Publication</h3>
        <p>{format.blurb}</p>
      </div>
      <div className="publication__formats" role="group" aria-label="Publication format" ref={formatsRef}>
        {PUBLICATION_FORMATS.filter((item) => item.button).map((item) => {
          const sizes = item.binding === 'paperback' || item.binding === 'hardcover'
            ? otherBindingSizes(item.binding)
            : [];
          const active = format.id === item.id || sizes.some((size) => size.id === format.id);
          return (
            <FormatChoice
              key={item.id}
              item={item}
              active={active}
              sizes={sizes}
              open={sizes.length > 0 && openSizes === item.binding}
              selectedId={format.id}
              onSelect={(id) => {
                setFormatId(id);
                setOpenSizes(null);
              }}
              onToggle={() => {
                const binding = item.binding;
                if (binding !== 'paperback' && binding !== 'hardcover') return;
                setOpenSizes((current) => current === binding ? null : binding);
              }}
            />
          );
        })}
      </div>
      <p className="publication__meta">
        {format.trim}
        {` · Title page${textPages ? ` and ${textPages} ${textPages === 1 ? 'page' : 'pages'}` : ''}`}
      </p>
      <div className={`publication__stage${format.kind === 'reader' ? ' is-reader' : ''}`}>
        {format.kind === 'reader' ? (
          <ReaderFrame
            pages={layout.pages}
            formatId={format.id}
            format={format}
            style={typeStyle}
            bodyPt={bodyPt}
            onSmaller={() => setReaderSize((size) => READER_SIZES[Math.max(0, READER_SIZES.indexOf(size) - 1)] ?? size)}
            onLarger={() => setReaderSize((size) => READER_SIZES[Math.min(READER_SIZES.length - 1, READER_SIZES.indexOf(size) + 1)] ?? size)}
            canSmaller={READER_SIZES.indexOf(bodyPt) > 0}
            canLarger={READER_SIZES.indexOf(bodyPt) < READER_SIZES.length - 1}
          />
        ) : layout.pages.map((page, index) => (
          <PrintPage key={`${page.kind}-${page.number ?? index}`} page={page} format={format} style={typeStyle} />
        ))}
      </div>
    </section>
  );
}

function FormatChoice({
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
      <button
        type="button"
        className="publication__format"
        aria-pressed={active}
        onClick={() => onSelect(item.id)}
      >
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
        ...pageBox(format),
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

function pageBox(format: ReturnType<typeof publicationFormat>): CSSProperties {
  return {
    ['--pub-w' as string]: String(format.widthIn),
    ['--pub-h' as string]: String(format.heightIn),
    ['--pub-mx' as string]: String(format.marginXIn),
    ['--pub-my' as string]: String(format.marginYIn),
  };
}

function ReaderFrame({
  pages,
  formatId,
  format,
  style,
  bodyPt,
  onSmaller,
  onLarger,
  canSmaller,
  canLarger,
}: {
  pages: PublicationPage[];
  formatId: PublicationFormatId;
  format: ReturnType<typeof publicationFormat>;
  style: CSSProperties;
  bodyPt: number;
  onSmaller: () => void;
  onLarger: () => void;
  canSmaller: boolean;
  canLarger: boolean;
}) {
  const tablet = formatId === 'tablet';
  const scroller = useRef<HTMLDivElement>(null);
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => {
    setPageIndex(0);
    scroller.current?.scrollTo({ top: 0 });
  }, [pages, bodyPt, formatId]);
  const syncIndex = () => {
    const node = scroller.current;
    if (!node || node.clientHeight <= 0) return;
    setPageIndex(Math.min(pages.length - 1, Math.max(0, Math.round(node.scrollTop / node.clientHeight))));
  };
  const turn = (direction: number) => {
    const node = scroller.current;
    if (!node) return;
    node.scrollBy({ top: direction * node.clientHeight, behavior: 'smooth' });
  };
  return (
    <div className={`pub-reader${tablet ? ' pub-reader--tablet' : ''}`}>
      <div className="pub-reader__bezel">
        <span>{tablet ? 'Tablet' : 'E-reader'}</span>
        <span>{pages.length ? `${pageIndex + 1} / ${pages.length}` : ''}</span>
      </div>
      <div className="pub-reader__controls">
        <button type="button" onClick={() => turn(-1)} disabled={pageIndex <= 0}>Previous page</button>
        <div className="pub-reader__size" role="group" aria-label="Text size">
          <button type="button" onClick={onSmaller} disabled={!canSmaller} aria-label="Smaller text">A−</button>
          <span aria-live="polite">{bodyPt}</span>
          <button type="button" onClick={onLarger} disabled={!canLarger} aria-label="Larger text">A+</button>
        </div>
        <button type="button" onClick={() => turn(1)} disabled={pageIndex >= pages.length - 1}>Next page</button>
      </div>
      <div
        className="pub-reader__viewport"
        ref={scroller}
        tabIndex={0}
        aria-label={tablet ? 'Tablet pages' : 'E-reader pages'}
        style={pageBox(format)}
        onScroll={syncIndex}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
            event.preventDefault();
            turn(1);
          } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
            event.preventDefault();
            turn(-1);
          }
        }}
        onClick={(event) => {
          if (!(event.target instanceof Element) || event.target.closest('button, a')) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          if (x > rect.width * 0.78) turn(1);
          else if (x < rect.width * 0.22) turn(-1);
        }}
      >
        {pages.map((page, index) => (
          <PrintPage key={`${page.kind}-${page.number ?? index}`} page={page} format={format} style={style} />
        ))}
      </div>
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
    const continued = (node.kind === 'paragraph' || node.kind === 'blockquote') && node.continued === true;
    const flush = !seenProse || continued;
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
