/**
 * One-page certification summary shared by the export preview and every exporter.
 * Describes origins; does not reclassify body text or list every passage.
 */

import {
  GRAMMAR_CHECK_COMMENT,
  SPELL_CHECK_COMMENT,
  TRUST_STATEMENT,
  type ProvenanceSpan,
} from './certification.ts';
import { UNAVAILABLE_DEVICE_LABEL, formatTypingDeviceLabel } from './deviceName.ts';
import type { ManuscriptDocument } from './document.ts';
import { displayTitle } from './document.ts';
import { manuscriptStats } from './manuscript.ts';
import { isProseBlock } from './types.ts';

export interface OriginWordTotals {
  keyboardSealed: number;
  /** Sealed dictated words. Not included in keyboard, paste, drop, or other. */
  dictationSealed: number;
  paste: number;
  drop: number;
  other: number;
  /** Paste + drop + other. Dictation is sealed, so it is not included. */
  pastedUncertified: number;
  totalWords: number;
}

export interface CertificationPageIdentity {
  bookTitle?: string;
  /** Preformatted series membership, omitted when the book is standalone. */
  seriesLabel?: string | null;
}

export const CERTIFICATION_PURPOSE =
  'HuManuScript tracks and certifies how a manuscript is written — typed versus pasted — as evidence of human-written content. It does not guarantee the work is human-generated. It shows how, when, and on what devices specific parts of the manuscript were introduced, and by what means: keyboard versus pasted. Certifications are timestamped and include a SHA key tied to the manuscript ID and device.';

/** Purpose first, then the trust limit, as the one summary banner. */
export function certificationBannerText(): string {
  return `${CERTIFICATION_PURPOSE} ${TRUST_STATEMENT}`;
}

/**
 * Instructions for checking a registered export.
 * The HMS- code, the registry clock, the file checksum, and the byte length are
 * filled in after the registry accepts the file. They stay off the export:
 * writing them in would change the bytes the file checksum describes.
 */
export interface RegistryInstruction {
  checkUrl: string;
  code: string | null;
  codeUrl: string | null;
  author: string | null;
  /** Copyright year the author entered. The app does not store a publication day. */
  published: string | null;
  exportedAtLabel: string;
  registeredAtLabel: string | null;
  title: string | null;
  seriesLabel: string | null;
  manuscriptId: string;
  filename: string;
  formatLabel: string | null;
  byteLength: number | null;
  fileSha256: string | null;
  canonicalSha256: string;
}

export const REGISTRY_NOTICE_HEADING = 'Certified Manuscript Registry';

function recorded(value: string | null | undefined): string {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text ? text : 'Not recorded';
}

/** The same lines go on the certification summary and on the export screen. */
export function registryInstructionLines(info: RegistryInstruction): string[] {
  const lines = [
    REGISTRY_NOTICE_HEADING,
    '',
    'Check this certification at the Certified Manuscript Registry. Read the summary there, then compare SHA-256 of the exact file bytes. The file is not uploaded, and the manuscript is not stored.',
    `Check the certification: ${info.checkUrl}`,
  ];
  if (info.code && info.codeUrl) {
    lines.push(`Registry code: ${info.code}`, `Code link: ${info.codeUrl}`);
  } else {
    lines.push(
      'Registry code: HuManuScript shows the HMS- code when the registry accepts this file. Send that code with the file. It is left out of these bytes so the file checksum still matches.',
    );
  }
  lines.push(
    `Author: ${recorded(info.author)}`,
    `Published: ${recorded(info.published)}`,
    `Exported: ${info.exportedAtLabel}`,
  );
  if (info.registeredAtLabel) lines.push(`Registered: ${info.registeredAtLabel}`);
  if (info.title?.trim()) lines.push(`Title: ${info.title.trim()}`);
  if (info.seriesLabel?.trim()) lines.push(`Series: ${info.seriesLabel.trim()}`);
  lines.push(`Manuscript id: ${info.manuscriptId}`, `File: ${info.filename}`);
  if (info.formatLabel?.trim()) lines.push(`Format: ${info.formatLabel.trim()}`);
  if (typeof info.byteLength === 'number') lines.push(`Bytes: ${info.byteLength}`);
  if (info.fileSha256) lines.push(`File SHA-256: ${info.fileSha256}`);
  lines.push(`Canonical text SHA-256: ${info.canonicalSha256}`);
  return lines;
}

export interface CertificationPageModel {
  product: 'HuManuScript';
  bookTitle: string;
  seriesLabel: string | null;
  manuscriptTitle: string;
  manuscriptId: string;
  exportedAt: string;
  exportedAtLabel: string;
  /** Present on a writer-file export that is sent to the registry. EPUB and print omit it. */
  registryNotice?: RegistryInstruction;
  /** Purpose and trust limit in one block. */
  banner: string;
  /** Distinct card labels for certified spans, in manuscript order. */
  devices: string[];
  totals: OriginWordTotals;
  chapters: number;
  scenes: number;
  sections: number;
  paragraphs: number;
  certificationPoints: number;
  /** Accepted spelling suggestions on sealed passages. Zero omits the spellcheck note. */
  spellChecks: number;
  /** Accepted Harper suggestions. Zero omits the grammar note. */
  grammarChecks: number;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatExportDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function emptyTotals(): OriginWordTotals {
  return {
    keyboardSealed: 0,
    dictationSealed: 0,
    paste: 0,
    drop: 0,
    other: 0,
    pastedUncertified: 0,
    totalWords: 0,
  };
}

function wordTotals(text: string, spans: ProvenanceSpan[]): OriginWordTotals {
  const totals = emptyTotals();
  if (!text.trim()) return totals;
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const at = match.index;
    const span = spans.find((s) => s.start <= at && s.end > at);
    if (span?.origin === 'keyboard' && span.certificationId) totals.keyboardSealed += 1;
    else if (span?.origin === 'dictation' && span.certificationId) totals.dictationSealed += 1;
    else if (span?.origin === 'paste') totals.paste += 1;
    else if (span?.origin === 'drop') totals.drop += 1;
    else totals.other += 1;
  }
  totals.pastedUncertified = totals.paste + totals.drop + totals.other;
  totals.totalWords = totals.keyboardSealed + totals.dictationSealed + totals.pastedUncertified;
  return totals;
}

function mergeTotals(into: OriginWordTotals, add: OriginWordTotals): void {
  into.keyboardSealed += add.keyboardSealed;
  into.dictationSealed += add.dictationSealed;
  into.paste += add.paste;
  into.drop += add.drop;
  into.other += add.other;
  into.pastedUncertified += add.pastedUncertified;
  into.totalWords += add.totalWords;
}

/**
 * Distinct device labels on certified spans, in manuscript order.
 * The unavailable sentence is replaced the same way a card replaces it.
 */
export function manuscriptDeviceLabels(doc: ManuscriptDocument, live?: string | null): string[] {
  const byId = new Map(doc.points.map((point) => [point.id, point]));
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const block of doc.blocks) {
    const prov = doc.provenance[block.id];
    const spans = [...(prov?.title ?? []), ...(prov?.text ?? [])];
    for (const span of spans) {
      if (!span.certificationId) continue;
      const stored = byId.get(span.certificationId)?.typingDevice;
      if (!stored?.trim()) continue;
      const label = formatTypingDeviceLabel(stored, live);
      if (!label || label === UNAVAILABLE_DEVICE_LABEL || seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

/** One stored device names itself. Several are listed by name. */
export function deviceStatLine(devices: string[]): string | null {
  if (devices.length === 0) return null;
  if (devices.length === 1) return `Device: ${devices[0]}`;
  return `Devices: ${devices.join(', ')}`;
}

export function buildCertificationPageModel(
  doc: ManuscriptDocument,
  exportedAt: string,
  identity: CertificationPageIdentity = {},
  liveDevice?: string | null,
): CertificationPageModel {
  const totals = emptyTotals();
  let spellChecks = 0;
  let grammarChecks = 0;
  for (const point of doc.points) {
    spellChecks += point.spellcheck?.checks.length ?? 0;
    grammarChecks += point.grammar?.checks.length ?? 0;
  }
  for (const block of doc.blocks) {
    const prov = doc.provenance[block.id];
    if (isProseBlock(block.type)) {
      mergeTotals(totals, wordTotals(block.text, prov?.text ?? []));
    } else if (block.title.trim()) {
      mergeTotals(totals, wordTotals(block.title, prov?.title ?? []));
    }
  }
  const stats = manuscriptStats(doc.blocks);
  const seriesLabel = identity.seriesLabel?.trim() || null;
  return {
    product: 'HuManuScript',
    bookTitle: identity.bookTitle?.trim() || displayTitle(doc),
    seriesLabel,
    manuscriptTitle: displayTitle(doc),
    manuscriptId: doc.manuscriptId,
    exportedAt,
    exportedAtLabel: formatExportDateTime(exportedAt),
    banner: certificationBannerText(),
    devices: manuscriptDeviceLabels(doc, liveDevice),
    totals,
    chapters: stats.chapters,
    scenes: stats.scenes,
    sections: stats.sections,
    paragraphs: stats.paragraphs,
    certificationPoints: doc.points.length,
    spellChecks,
    grammarChecks,
  };
}

/** Ordered lines of the one-page summary. Exporters and the preview render these facts. */
export function certificationFactLines(model: CertificationPageModel): string[] {
  const lines = ['HuManuScript certification summary', ''];
  if (model.registryNotice) lines.push(...registryInstructionLines(model.registryNotice), '');
  lines.push(model.banner, '', `Book: ${model.bookTitle}`);
  if (model.seriesLabel) lines.push(`Series: ${model.seriesLabel}`);
  lines.push(
    `Manuscript: ${model.manuscriptTitle}`,
    `Manuscript id: ${model.manuscriptId}`,
    '',
    'Certified versus pasted',
    `Keyboard-certified words: ${model.totals.keyboardSealed}`,
    `Dictation-certified words: ${model.totals.dictationSealed}`,
    `Pasted / uncertified words: ${model.totals.pastedUncertified}`,
    `Paste: ${model.totals.paste}`,
    `Drop: ${model.totals.drop}`,
    `Other: ${model.totals.other}`,
    '',
    'Statistics',
    `Exported: ${model.exportedAtLabel}`,
    `Total words: ${model.totals.totalWords}`,
    `Certified words: ${model.totals.keyboardSealed + model.totals.dictationSealed}`,
    `Pasted / uncertified words: ${model.totals.pastedUncertified}`,
    `Chapters: ${model.chapters}`,
    `Scenes: ${model.scenes}`,
    `Sections: ${model.sections}`,
    `Paragraphs: ${model.paragraphs}`,
    `Certification points: ${model.certificationPoints}`,
  );
  if (model.spellChecks > 0) {
    lines.push(`Spell checks: ${model.spellChecks}`, SPELL_CHECK_COMMENT);
  }
  if (model.grammarChecks > 0) {
    lines.push(`Grammar checks: ${model.grammarChecks}`, GRAMMAR_CHECK_COMMENT);
  }
  const devices = deviceStatLine(model.devices);
  if (devices) lines.push(devices);
  lines.push(`Book: ${model.bookTitle}`);
  if (model.seriesLabel) lines.push(`Series: ${model.seriesLabel}`);
  return lines;
}

export function certificationPagePlain(model: CertificationPageModel): string {
  return `${certificationFactLines(model).join('\n')}\n`;
}

export { TRUST_STATEMENT };
