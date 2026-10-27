import { useEffect, useState } from 'react';
import { subscribeLocalUpdate, updatePromptModel } from '../core/appUpdate.ts';
import type { AvailableUpdate, UpdateFeedPhase } from '../core/deviceName.ts';

const NOTICE_PHASES = new Set<UpdateFeedPhase>([
  'available',
  'downloading',
  'downloaded',
  'failed',
  'checking',
  'current',
  'check-failed',
]);

type Feed = {
  phase: UpdateFeedPhase;
  version: string;
  percent: number;
};

function feedFrom(update: AvailableUpdate | null | undefined): Feed | null {
  if (!update) return null;
  const phase = update.phase ?? 'available';
  if (!NOTICE_PHASES.has(phase)) return null;
  return {
    phase,
    version: update.version ?? '',
    percent: typeof update.percent === 'number' ? update.percent : 0,
  };
}

export function UpdateAvailableNotice() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const bridge = window.humanuscript;
    const apply = (update: AvailableUpdate | null | undefined) => {
      const next = feedFrom(update);
      if (!next) return;
      setFeed(next);
      if (next.phase !== 'available' && next.phase !== 'failed') setConfirming(false);
    };
    apply(bridge?.getUpdateAvailable?.() ?? null);
    const offBridge = bridge?.onUpdateAvailable?.(apply) ?? (() => {});
    const offLocal = subscribeLocalUpdate(apply);
    return () => {
      offBridge();
      offLocal();
    };
  }, []);

  if (!feed) return null;
  const model = updatePromptModel({ ...feed, confirming });
  if (!model) return null;

  const onPrimary = () => {
    if (model.phase === 'available' || model.phase === 'failed') {
      setConfirming(true);
      return;
    }
    if (model.phase === 'confirm') {
      void window.humanuscript?.downloadUpdate?.();
      return;
    }
    if (model.phase === 'downloaded') void window.humanuscript?.installUpdate?.();
  };

  const onSecondary = () => {
    if (model.phase === 'current' || model.phase === 'check-failed') {
      setFeed(null);
      return;
    }
    setConfirming(false);
  };

  return (
    <div
      className={`update-available update-available--${model.phase}`}
      role={model.phase === 'failed' ? 'alert' : 'status'}
      aria-live="polite"
      aria-busy={model.phase === 'downloading'}
      data-update-phase={model.phase}
    >
      <div className="update-available__copy">
        <p className="update-available__message">{model.message}</p>
        <p className="update-available__detail">{model.detail}</p>
      </div>
      {model.percent != null && (
        <progress className="update-available__progress" max={100} value={model.percent} aria-label={model.message} />
      )}
      {model.primary || model.secondary ? (
        <div className="update-available__actions">
          {model.secondary ? (
            <button type="button" className="ghost" onClick={onSecondary}>
              {model.secondary}
            </button>
          ) : null}
          {model.primary ? (
            <button type="button" className="primary" onClick={onPrimary}>
              {model.primary}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
