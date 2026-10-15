/**
 * Front-of-export certification summary. Describes origins; does not reclassify body text.
 */

import { type InsertionOrigin, type ProvenanceSpan, TRUST_STATEMENT } from './certification.ts';
import type { ManuscriptDocument } from './document.ts';
import { displayTitle } from './document.ts';
import type { ManuscriptBlock } from './types.ts';

export interface OriginWordTotals {
  keyboardSealed: number;
  paste: number;
  drop: number;
  other: number;
}

export interface CertificationPageModel {
  product: 'HuManuScript';
  manuscriptTitle: string;
  manuscriptId: string;
  exportedAt: string;
  trust: string;
  totals: OriginWordTotals;
  certificationPoints: number;
  sealedPassages: Array<{ text: string; contentHash: string; updatedAt: string }>;
  uncertifiedExcerpts: Array<{ blockLabel: string; origin: InsertionOrigin; text: string }>;
}

function blockLabel(block: ManuscriptBlock, chapterNo?: number): string {
  if (block.type === 'chapter') return chapterNo ? `Chapter ${chapterNo}` : 'Chapter';
  if (block.type === 'scene') return block.title.trim() || 'Scene';
  if (block.type === 'section') return block.title.trim() || 'Section';
  return 'Paragraph';
}

function wordTotals(text: string, spans: ProvenanceSpan[]): OriginWordTotals {
  const totals: OriginWordTotals = { keyboardSealed: 0, paste: 0, drop: 0, other: 0 };
  if (!text.trim()) return totals;
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const at = match.index;
    const span = spans.find((s) => s.start <= at && s.end > at);
    if (!span) {
      totals.other += 1;
      continue;
    }
    if (span.origin === 'keyboard' && span.certificationId) totals.keyboardSealed += 1;
    else if (span.origin === 'paste') totals.paste += 1;
    else if (span.origin === 'drop') totals.drop += 1;
    else totals.other += 1;
  }
  return totals;
}

function mergeTotals(into: OriginWordTotals, add: OriginWordTotals): void {
  into.keyboardSealed += add.keyboardSealed;
  into.paste += add.paste;
  into.drop += add.drop;
  into.other += add.other;
}

export function buildCertificationPageModel(doc: ManuscriptDocument, exportedAt: string): CertificationPageModel {
  const totals: OriginWordTotals = { keyboardSealed: 0, paste: 0, drop: 0, other: 0 };
  const uncertifiedExcerpts: CertificationPageModel['uncertifiedExcerpts'] = [];
  let chapterNo = 0;

  for (const block of doc.blocks) {
    if (block.type === 'chapter') chapterNo += 1;
    const label = blockLabel(block, block.type === 'chapter' ? chapterNo : undefined);
    const field = block.type === 'paragraph' || block.type === 'blockquote' ? 'text' : 'title';
    const text = field === 'text' ? block.text : block.title;
    const spans = doc.provenance[block.id]?.[field === 'text' ? 'text' : 'title'] ?? [];
    if (!text.trim()) continue;
    mergeTotals(totals, wordTotals(text, spans));
    for (const span of spans) {
      if (span.end <= span.start) continue;
      const sealed = span.origin === 'keyboard' && span.certificationId;
      if (sealed) continue;
      const slice = text.slice(span.start, span.end).trim();
      if (!slice) continue;
      uncertifiedExcerpts.push({ blockLabel: label, origin: span.origin, text: slice });
    }
  }

  return {
    product: 'HuManuScript',
    manuscriptTitle: displayTitle(doc),
    manuscriptId: doc.manuscriptId,
    exportedAt,
    trust: TRUST_STATEMENT,
    totals,
    certificationPoints: doc.points.length,
    sealedPassages: doc.points.map((p) => ({
      text: p.text,
      contentHash: p.contentHash,
      updatedAt: p.updatedAt,
    })),
    uncertifiedExcerpts,
  };
}

export function certificationPagePlain(model: CertificationPageModel): string {
  const lines: string[] = [
    'HUMANUSCRIPT CERTIFICATION SUMMARY',
    '================================',
    '',
    `Manuscript: ${model.manuscriptTitle}`,
    `Manuscript id: ${model.manuscriptId}`,
    `Exported: ${model.exportedAt}`,
    '',
    'Trust limit',
    '-----------',
    model.trust,
    '',
    'Word counts by how text entered this editor',
    '------------------------------------------',
    `Keyboard-sealed words: ${model.totals.keyboardSealed}`,
    `Pasted words (not sealed): ${model.totals.paste}`,
    `Dropped words (not sealed): ${model.totals.drop}`,
    `Other / unknown insertion (not sealed): ${model.totals.other}`,
    `Certification points on file: ${model.certificationPoints}`,
    '',
  ];

  if (model.sealedPassages.length) {
    lines.push('Keyboard-sealed passages', '----------------------');
    for (const passage of model.sealedPassages) {
      lines.push(`• ${passage.text}`);
      lines.push(`  Hash: ${passage.contentHash}`);
      lines.push(`  Updated: ${passage.updatedAt}`);
      lines.push('');
    }
  } else {
    lines.push('No keyboard-sealed passages yet.', '');
  }

  if (model.uncertifiedExcerpts.length) {
    lines.push('Passages that are not keyboard-sealed', '------------------------------------');
    for (const item of model.uncertifiedExcerpts) {
      lines.push(`• [${item.origin}] ${item.blockLabel}: ${item.text}`);
    }
    lines.push('');
  }

  lines.push('The manuscript body follows this page. Body text is exported as written.');
  lines.push('Export does not turn pasted or dropped text into sealed keyboard text.');
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

export { TRUST_STATEMENT };
