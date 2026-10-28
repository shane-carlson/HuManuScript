import { useRef, useState } from 'react';
import { appVersion } from 'virtual:app-version';
import { getTypingDeviceLabel } from '../core/deviceName.ts';
import type { ManuscriptDocument } from '../core/document.ts';
import {
  buildRegistrationBody,
  canonicalManuscriptText,
  deleteRegistration,
  registeredMessage,
  registryBaseUrl,
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
}

interface RegistrationChoice {
  title: string;
  seriesLabel: string | null;
  includeDeviceNames: boolean;
  includeDetailedReport: boolean;
}

type Status =
  | { kind: 'registered'; message: string; code: string; pageUrl: string; filename: string }
  | { kind: 'missed'; message: string }
  | { kind: 'removed'; message: string }
  | { kind: 'remove-failed'; message: string };

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

  async function attempt(current: HeldExport, selected: RegistrationChoice): Promise<boolean> {
    try {
      const body = await buildRegistrationBody({
        doc: current.doc,
        appVersion: appVersion.version,
        exportedAt: current.exportedAt,
        title: selected.title,
        seriesLabel: selected.seriesLabel,
        filename: current.filename,
        byteLength: current.byteLength,
        fileSha256: current.fileSha256,
        canonicalSha256: current.canonicalSha256,
        canonicalUtf8Bytes: current.canonicalUtf8Bytes,
        includeDeviceNames: selected.includeDeviceNames,
        includeDetailedReport: selected.includeDetailedReport,
        liveDevice: current.liveDevice,
      });
      const result = await submitRegistration({
        baseUrl: configuredBaseUrl(),
        body,
        format: current.format,
      });
      if (!result.ok) {
        setStatus({ kind: 'missed', message: unregisteredMessage() });
        return false;
      }
      args.onReceipt(result.receipt);
      setStatus({
        kind: 'registered',
        message: registeredMessage(result.includedDetailedReport),
        code: result.receipt.code,
        pageUrl: result.pageUrl,
        filename: result.receipt.filename,
      });
      return true;
    } catch (error) {
      console.error(error);
      setStatus({ kind: 'missed', message: unregisteredMessage() });
      return false;
    }
  }

  async function publish(file: ProducedExport): Promise<void> {
    const selected = choice();
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
      };
      held.current = current;
      frozen = true;
      const registered = await attempt(current, selected);
      setCanRetry(!registered);
    } catch (error) {
      console.error(error);
      setStatus({ kind: 'missed', message: unregisteredMessage() });
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
      const registered = await attempt(current, choice());
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
  };
}

export type RegistryExportController = ReturnType<typeof useRegistryExport>;
