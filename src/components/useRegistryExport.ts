import { useRef, useState } from 'react';
import { appVersion } from 'virtual:app-version';
import { formatExportDateTime, registryInstructionLines, type RegistryInstruction } from '../core/certificationPage.ts';
import { getTypingDeviceLabel } from '../core/deviceName.ts';
import type { ManuscriptDocument } from '../core/document.ts';
import { EXPORT_FORMAT_LABELS, type ExportFormat } from '../core/exportManuscript.ts';
import type { SealSource } from '../core/sessionCapture.ts';
import { loadPassageCaptureImages } from '../sessionCaptureStore.ts';
import {
  buildRegistrationBody,
  canonicalManuscriptText,
  deleteRegistration,
  exportWritesRegistryInstructions,
  registeredMessage,
  registrationFailureDetail,
  registryBaseUrl,
  registryCheckUrl,
  registryCodeUrl,
  registryRegistrationsUrl,
  removeFailedMessage,
  removedMessage,
  sha256Hex,
  sha256Utf8,
  submitRegistration,
  unregisteredMessage,
  type RegistryReceipt,
} from '../core/registry.ts';

export interface ProducedExport {
  blob: Blob;
  filename: string;
  format: string;
  exportedAt: string;
}

interface HeldExport {
  blob: Blob;
  filename: string;
  format: string;
  exportedAt: string;
  doc: ManuscriptDocument;
  liveDevice: string | null;
  fileSha256: string;
  byteLength: number;
  canonicalSha256: string;
  canonicalUtf8Bytes: number;
  facts: RegistryExportFacts;
}

interface RegistrationChoice {
  title: string;
  seriesLabel: string | null;
  includeDeviceNames: boolean;
  includeDetailedReport: boolean;
}

type Status =
  | { kind: 'registered'; message: string; code: string; pageUrl: string; filename: string; instructions: string[] }
  | { kind: 'missed'; message: string; detail: string }
  | { kind: 'removed'; message: string }
  | { kind: 'remove-failed'; message: string };

export interface RegistryExportFacts {
  title: string;
  seriesLabel: string | null;
  includeDeviceNames: boolean;
  includeDetailedReport: boolean;
  author: string | null;
  published: string | null;
}

function sealSources(doc: ManuscriptDocument): SealSource[] {
  return doc.points.map((point) => ({
    id: point.id,
    blockId: point.blockId,
    contentHash: point.contentHash,
    origin: point.origin,
    sealedAt: point.sealedAt,
    updatedAt: point.updatedAt,
  }));
}

function formatLabel(format: string): string {
  if (format === 'print') return 'Format for Print';
  if (format in EXPORT_FORMAT_LABELS) return EXPORT_FORMAT_LABELS[format as ExportFormat];
  return format;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function configuredBaseUrl(): string {
  const override = import.meta.env.VITE_REGISTRY_BASE_URL;
  return registryBaseUrl(typeof override === 'string' ? override : null);
}

export function useRegistryExport(args: {
  doc: ManuscriptDocument;
  manuscriptId: string;
  defaultTitle: string;
  seriesLabel: string | null;
  author: string;
  published: string | null;
  onReceipt: (receipt: RegistryReceipt) => void;
  onRemoveReceipt: (code: string) => void;
}) {
  const [title, setTitle] = useState(args.defaultTitle);
  const [includeDeviceNames, setIncludeDeviceNames] = useState(false);
  const [includeDetailedReport, setIncludeDetailedReport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [seenId, setSeenId] = useState(args.manuscriptId);
  const held = useRef<HeldExport | null>(null);

  if (args.manuscriptId !== seenId) {
    setSeenId(args.manuscriptId);
    setTitle(args.defaultTitle);
    setStatus(null);
    setCanRetry(false);
  }

  const choice = (): RegistrationChoice => ({
    title,
    seriesLabel: args.seriesLabel,
    includeDeviceNames,
    includeDetailedReport,
  });

  const liveFacts = (): RegistryExportFacts => ({
    ...choice(),
    author: args.author.trim() || null,
    published: args.published,
  });

  function instructionFor(current: HeldExport, facts: RegistryExportFacts, proof?: {
    code: string;
    receivedAt: string;
  }): RegistryInstruction {
    const base = configuredBaseUrl();
    return {
      checkUrl: registryCheckUrl(base),
      code: proof?.code ?? null,
      codeUrl: proof ? registryCodeUrl(base, proof.code) : null,
      author: facts.author,
      published: facts.published,
      exportedAtLabel: formatExportDateTime(current.exportedAt),
      registeredAtLabel: proof ? formatExportDateTime(proof.receivedAt) : null,
      title: facts.title.trim() || null,
      seriesLabel: facts.seriesLabel,
      manuscriptId: current.doc.manuscriptId,
      filename: current.filename,
      formatLabel: formatLabel(current.format),
      byteLength: proof ? current.byteLength : null,
      fileSha256: proof ? current.fileSha256 : null,
      canonicalSha256: current.canonicalSha256,
    };
  }

  async function attempt(current: HeldExport, facts: RegistryExportFacts): Promise<boolean> {
    try {
      const passageImages = facts.includeDetailedReport
        ? await loadPassageCaptureImages(current.doc.manuscriptId, sealSources(current.doc))
        : undefined;
      const body = await buildRegistrationBody({
        doc: current.doc,
        appVersion: appVersion.version,
        exportedAt: current.exportedAt,
        title: facts.title,
        seriesLabel: facts.seriesLabel,
        filename: current.filename,
        byteLength: current.byteLength,
        fileSha256: current.fileSha256,
        canonicalSha256: current.canonicalSha256,
        canonicalUtf8Bytes: current.canonicalUtf8Bytes,
        includeDeviceNames: facts.includeDeviceNames,
        includeDetailedReport: facts.includeDetailedReport,
        liveDevice: current.liveDevice,
        passageImages,
      });
      const result = await submitRegistration({
        baseUrl: configuredBaseUrl(),
        body,
        format: current.format,
      });
      if (!result.ok) {
        setStatus({ kind: 'missed', message: unregisteredMessage(), detail: registrationFailureDetail(result) });
        return false;
      }
      args.onReceipt(result.receipt);
      const wroteInstructions = exportWritesRegistryInstructions(current.format);
      setStatus({
        kind: 'registered',
        message: registeredMessage(result.includedDetailedReport, wroteInstructions),
        code: result.receipt.code,
        pageUrl: registryCodeUrl(configuredBaseUrl(), result.receipt.code),
        filename: result.receipt.filename,
        instructions: registryInstructionLines(
          instructionFor(current, facts, { code: result.receipt.code, receivedAt: result.receipt.receivedAt }),
        ),
      });
      return true;
    } catch (error) {
      console.error(error);
      setStatus({ kind: 'missed', message: unregisteredMessage(), detail: registrationNotSentDetail(error) });
      return false;
    }
  }

  function registrationNotSentDetail(error: unknown): string {
    const url = registryRegistrationsUrl(configuredBaseUrl());
    const reason = error instanceof Error && error.message ? error.message : 'The registration could not be prepared.';
    return `The request to ${url} was not sent. ${reason}`;
  }

  async function publish(file: ProducedExport, pinned?: RegistryExportFacts): Promise<void> {
    const facts = pinned ?? liveFacts();
    setBusy(true);
    setStatus(null);
    setCanRetry(false);
    let downloadable = file.blob;
    let frozen = false;
    try {
      const snapshot = structuredClone(args.doc);
      const bytes = new Uint8Array(await file.blob.arrayBuffer());
      downloadable = new Blob([bytes], { type: file.blob.type });
      const canonical = await sha256Utf8(canonicalManuscriptText(snapshot));
      const current: HeldExport = {
        blob: downloadable,
        filename: file.filename,
        format: file.format,
        exportedAt: file.exportedAt,
        doc: snapshot,
        liveDevice: await getTypingDeviceLabel(),
        fileSha256: await sha256Hex(bytes),
        byteLength: bytes.byteLength,
        canonicalSha256: canonical.sha256,
        canonicalUtf8Bytes: canonical.utf8Bytes,
        facts,
      };
      held.current = current;
      frozen = true;
      const registered = await attempt(current, facts);
      setCanRetry(!registered);
    } catch (error) {
      console.error(error);
      setStatus({ kind: 'missed', message: unregisteredMessage(), detail: registrationNotSentDetail(error) });
      setCanRetry(frozen);
    } finally {
      downloadBlob(file.filename, downloadable);
      setBusy(false);
    }
  }

  async function retry(): Promise<void> {
    const current = held.current;
    if (!current || current.doc.manuscriptId !== args.manuscriptId) return;
    setBusy(true);
    try {
      const registered = await attempt(current, current.facts);
      setCanRetry(!registered);
    } finally {
      setBusy(false);
    }
  }

  async function remove(receipt: RegistryReceipt): Promise<void> {
    setBusy(true);
    try {
      const removed = await deleteRegistration({
        baseUrl: configuredBaseUrl(),
        code: receipt.code,
        deleteToken: receipt.deleteToken,
      });
      if (removed) {
        args.onRemoveReceipt(receipt.code);
        setStatus({ kind: 'removed', message: removedMessage() });
      } else {
        setStatus({ kind: 'remove-failed', message: removeFailedMessage() });
      }
    } finally {
      setBusy(false);
    }
  }

  return {
    title,
    setTitle,
    includeDeviceNames,
    setIncludeDeviceNames,
    includeDetailedReport,
    setIncludeDetailedReport,
    busy,
    status,
    publish,
    retry,
    remove,
    canRetry,
    codeUrl: (code: string) => registryCodeUrl(configuredBaseUrl(), code),
  };
}

export type RegistryExportController = ReturnType<typeof useRegistryExport>;
