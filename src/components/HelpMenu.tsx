import { useEffect, useRef, useState } from 'react';
import { publishLocalUpdate } from '../core/appUpdate.ts';

const CHECK_FAILED = { phase: 'check-failed' as const, version: '', percent: 0 };

export function HelpMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const checkForUpdates = () => {
    setOpen(false);
    const check = window.humanuscript?.checkForUpdates;
    if (!check) {
      publishLocalUpdate(CHECK_FAILED);
      return;
    }
    void Promise.resolve(check()).catch(() => {
      publishLocalUpdate(CHECK_FAILED);
    });
  };

  return (
    <div className="help-menu" ref={ref}>
      <button
        type="button"
        className="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="humanuscript-help-menu"
        onClick={() => setOpen((value) => !value)}
      >
        Help
      </button>
      {open && (
        <div id="humanuscript-help-menu" className="help-menu__list" role="menu" aria-label="Help">
          <button type="button" role="menuitem" data-menu-item="check-for-updates" onClick={checkForUpdates}>
            Check for updates
          </button>
        </div>
      )}
    </div>
  );
}
