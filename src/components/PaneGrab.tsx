import { useRef, useState } from 'react';
import { clampPaneWidth } from '../core/layoutSession.ts';

export function PaneGrab({
  label,
  value,
  min,
  max,
  direction,
  className,
  getMax,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  /** 1 grows the pane as the pointer moves right. -1 grows it as the pointer moves left. */
  direction: 1 | -1;
  className?: string;
  getMax?: () => number;
  onChange: (width: number) => void;
  onCommit: (width: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const limit = () => {
    const cap = getMax?.();
    return Number.isFinite(cap) ? Math.min(max, cap as number) : max;
  };

  const resizeTo = (next: number, commit: boolean) => {
    const width = clampPaneWidth(next, min, Math.max(min, limit()));
    onChange(width);
    if (commit) onCommit(width);
  };

  return (
    <button
      type="button"
      className={`pane-grab${dragging ? ' is-dragging' : ''}${className ? ` ${className}` : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)} pixels`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const handle = event.currentTarget;
        const startX = event.clientX;
        const start = valueRef.current;
        handle.setPointerCapture(event.pointerId);
        setDragging(true);
        const apply = (clientX: number, commit: boolean) => {
          resizeTo(start + direction * (clientX - startX), commit);
        };
        const move = (ev: PointerEvent) => apply(ev.clientX, false);
        const end = (ev: PointerEvent) => {
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', end);
          handle.removeEventListener('pointercancel', end);
          setDragging(false);
          apply(ev.clientX, true);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const step = event.shiftKey ? 24 : 8;
        const delta = event.key === 'ArrowRight' ? step : -step;
        resizeTo(valueRef.current + direction * delta, true);
      }}
    />
  );
}
