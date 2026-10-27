/**
 * DOM stand-in for PublicationView's Flow.
 * Class names match FlowNode so the measured box is the page the reader sees.
 */

import type { PublicationNode } from '../core/publication.ts';
import { styledSpans } from '../core/richText.ts';
import type { InlineMark } from '../core/types.ts';

function appendRuns(parent: HTMLElement, text: string, marks: InlineMark[]): void {
  for (const span of styledSpans(text, marks)) {
    let body: Node = document.createTextNode(span.text);
    if (span.bold) {
      const el = document.createElement('strong');
      el.append(body);
      body = el;
    }
    if (span.italic) {
      const el = document.createElement('em');
      el.append(body);
      body = el;
    }
    if (span.underline) {
      const el = document.createElement('u');
      el.append(body);
      body = el;
    }
    if (span.strike) {
      const el = document.createElement('s');
      el.append(body);
      body = el;
    }
    const wrap = document.createElement('span');
    wrap.append(body);
    parent.append(wrap);
  }
}

function seenProse(prior: readonly PublicationNode[]): boolean {
  let prose = false;
  for (const node of prior) {
    if (
      node.kind === 'chapter' ||
      node.kind === 'section' ||
      node.kind === 'scene' ||
      node.kind === 'ornament' ||
      node.kind === 'gap'
    ) {
      prose = false;
    }
    if (node.kind === 'paragraph' || node.kind === 'blockquote') prose = true;
  }
  return prose;
}

function isFlush(prior: readonly PublicationNode[], node: PublicationNode): boolean {
  const continued = (node.kind === 'paragraph' || node.kind === 'blockquote') && node.continued === true;
  return !seenProse(prior) || continued;
}

function createPublicationElement(node: PublicationNode, flush: boolean): HTMLElement {
  switch (node.kind) {
    case 'chapter': {
      const heading = document.createElement('h3');
      heading.className = 'pub-chapter';
      const kicker = document.createElement('span');
      kicker.className = 'pub-chapter__kicker';
      kicker.textContent = node.kicker;
      heading.append(kicker);
      if (node.title) {
        const title = document.createElement('span');
        title.className = 'pub-chapter__title';
        title.textContent = node.title;
        heading.append(title);
      }
      return heading;
    }
    case 'section': {
      const heading = document.createElement('h4');
      heading.className = 'pub-section';
      heading.textContent = node.title;
      return heading;
    }
    case 'scene': {
      const heading = document.createElement('h4');
      heading.className = 'pub-scene';
      heading.textContent = node.title;
      return heading;
    }
    case 'ornament': {
      const line = document.createElement('p');
      line.className = 'pub-ornament';
      line.textContent = node.text;
      return line;
    }
    case 'gap': {
      const gap = document.createElement('div');
      gap.className = 'pub-gap';
      gap.setAttribute('aria-hidden', 'true');
      return gap;
    }
    case 'note': {
      const note = document.createElement('p');
      note.className = 'pub-note';
      note.textContent = node.text;
      return note;
    }
    case 'blockquote': {
      const quote = document.createElement('blockquote');
      quote.className = 'pub-quote';
      appendRuns(quote, node.text, node.marks);
      return quote;
    }
    case 'paragraph': {
      const paragraph = document.createElement('p');
      paragraph.className = `pub-p${flush || node.listStyle ? ' is-flush' : ''}${node.listStyle ? ' is-list' : ''}`;
      if (node.indentLevel) paragraph.style.marginLeft = `${node.indentLevel * 1.25}em`;
      if (node.listStyle === 'bullet') {
        const marker = document.createElement('span');
        marker.className = 'pub-marker';
        marker.textContent = '•';
        paragraph.append(marker);
      }
      if (node.listStyle === 'number' && node.listIndex) {
        const marker = document.createElement('span');
        marker.className = 'pub-marker';
        marker.textContent = `${node.listIndex}.`;
        paragraph.append(marker);
      }
      appendRuns(paragraph, node.text, node.marks);
      return paragraph;
    }
    case 'table': {
      const table = document.createElement('table');
      table.className = 'pub-table';
      const body = document.createElement('tbody');
      for (const row of node.rows) {
        const tr = document.createElement('tr');
        for (const cell of row) {
          const td = document.createElement('td');
          td.textContent = cell;
          tr.append(td);
        }
        body.append(tr);
      }
      table.append(body);
      return table;
    }
    case 'image': {
      if (!node.src) {
        const note = document.createElement('p');
        note.className = 'pub-note';
        note.textContent = `[Image: ${node.alt || node.caption}]`;
        return note;
      }
      const figure = document.createElement('figure');
      figure.className = 'pub-figure';
      const image = document.createElement('img');
      image.src = node.src;
      image.alt = node.alt || node.caption || '';
      figure.append(image);
      if (node.caption) {
        const caption = document.createElement('figcaption');
        caption.textContent = node.caption;
        figure.append(caption);
      }
      return figure;
    }
    default: {
      const unreachable: never = node;
      return unreachable;
    }
  }
}

export function renderPublicationFlow(flow: HTMLElement, nodes: readonly PublicationNode[]): void {
  flow.replaceChildren();
  nodes.forEach((node, index) => {
    flow.append(createPublicationElement(node, isFlush(nodes.slice(0, index), node)));
  });
}

/** True when the flow stays inside the page body, including the last line's box. */
export function flowFitsBody(body: HTMLElement, flow: HTMLElement): boolean {
  const room = body.getBoundingClientRect().bottom;
  const used = flow.getBoundingClientRect().bottom;
  return used <= room + 0.5;
}
