import { useState } from 'react';
import { REGISTRY_NAME, type RegistryReceipt } from '../core/registry.ts';
import { type RegistryExportController } from './useRegistryExport.ts';

export function RegistryExportCard({
  receipts,
  registry,
}: {
  receipts: RegistryReceipt[];
  registry: RegistryExportController;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="registry-card" aria-labelledby="registry-heading">
      <h3 id="registry-heading">{REGISTRY_NAME}</h3>
      <p>
        A download can register the certification summary and two checksums. The file is not uploaded. The code stays
        beside the file, in the mail or on a slip, and is not written into it.
      </p>
      <label className="field" htmlFor="registry-title">
        Title on the {REGISTRY_NAME}
        <input
          id="registry-title"
          value={registry.title}
          disabled={registry.busy}
          onChange={(event) => registry.setTitle(event.target.value)}
        />
      </label>
      <p className="hint">Clear the title to leave it off the registration. The file itself is unchanged.</p>
      <label className="epub-switch" htmlFor="registry-device-names">
        <input
          id="registry-device-names"
          type="checkbox"
          checked={registry.includeDeviceNames}
          disabled={registry.busy}
          onChange={(event) => registry.setIncludeDeviceNames(event.target.checked)}
        />
        <span>Include computer and device names</span>
      </label>
      <p className="hint">Off unless you turn it on. The kind of input, keyboard or microphone, is always sent. Hostnames and device names are sent only with this box.</p>
      <label className="epub-switch" htmlFor="registry-detailed-report">
        <input
          id="registry-detailed-report"
          type="checkbox"
          checked={registry.includeDetailedReport}
          disabled={registry.busy}
          onChange={(event) => registry.setIncludeDetailedReport(event.target.checked)}
        />
        <span>Include the detailed certification report</span>
      </label>
      <p className="hint">
        HuManuScript generates that report from the manuscript already open here. You do not attach a file. Passage
        text and session pictures stay on this computer. The manuscript text is not uploaded. Leave this unchecked to
        register the summary and the two checksums only.
      </p>
      <div className="registry-status" aria-live="polite">
        {registry.busy ? <p>Contacting the {REGISTRY_NAME}…</p> : null}
        {registry.status ? (
          <p className={registry.status.kind === 'missed' || registry.status.kind === 'remove-failed' ? 'export-error' : undefined}>
            {registry.status.message}
          </p>
        ) : null}
        {registry.status?.kind === 'registered' ? (
          <div className="registry-code-block">
            <p>
              <span className="registry-code">{registry.status.code}</span>
            </p>
            <p>
              <a href={registry.status.pageUrl} target="_blank" rel="noreferrer">
                {registry.status.pageUrl}
              </a>
            </p>
            <p className="hint">For {registry.status.filename}. The download is the same file that was hashed.</p>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                const code = registry.status?.kind === 'registered' ? registry.status.code : '';
                void navigator.clipboard.writeText(code).then(
                  () => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  },
                  () => setCopied(false),
                );
              }}
            >
              {copied ? 'Copied' : 'Copy code'}
            </button>
          </div>
        ) : null}
        {registry.canRetry ? (
          <button type="button" className="ghost" disabled={registry.busy} onClick={() => void registry.retry()}>
            Try registration again
          </button>
        ) : null}
        {registry.canRetry ? <p className="hint">Uses this same file. It does not export again.</p> : null}
      </div>
      {receipts.length > 0 ? (
        <div className="registry-receipts">
          <h4>Codes kept with this book</h4>
          <ul>
            {receipts.map((receipt) => (
              <li key={receipt.code}>
                <span className="registry-code">{receipt.code}</span>
                <span className="hint">{receipt.filename}</span>
                <button type="button" className="ghost" disabled={registry.busy} onClick={() => void registry.remove(receipt)}>
                  Remove from the {REGISTRY_NAME}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
