import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type MixKnobProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  /** Fine step when Shift is held (defaults to step / 10). */
  fineStep?: number;
  defaultValue: number;
  ariaLabel: string;
  valueText: string;
  displayValue: string;
  /** Parse a typed display string back to a numeric value. */
  parseDisplay: (raw: string) => number | null;
  onChange: (next: number) => void;
  onCommit: (next: number) => void;
  className?: string;
};

const DRAG_PIXELS_PER_RANGE = 120;
const FINE_FACTOR = 0.1;
const DRAG_THRESHOLD_PX = 3;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function quantize(n: number, step: number): number {
  if (step <= 0) return n;
  const rounded = Math.round(n / step) * step;
  // Avoid -0 and float dust.
  return Number(rounded.toFixed(6));
}

function valueToAngle(value: number, min: number, max: number): number {
  const t = max === min ? 0 : (value - min) / (max - min);
  // Sweep from -135° to +135° (270° total).
  return -135 + t * 270;
}

/**
 * Rotary gain/pan control: vertical drag, Shift fine, double-click reset,
 * click value to type, arrow keys. Commits on gesture end (not mid-drag).
 */
export function MixKnob({
  value,
  min,
  max,
  step,
  fineStep,
  defaultValue,
  ariaLabel,
  valueText,
  displayValue,
  parseDisplay,
  onChange,
  onCommit,
  className,
}: MixKnobProps) {
  const labelId = useId();
  const knobRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayValue);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startValue: number;
    moved: boolean;
    shift: boolean;
  } | null>(null);

  liveRef.current = value;

  useEffect(() => {
    if (!editing) setDraft(displayValue);
  }, [displayValue, editing]);

  const applyLive = (next: number) => {
    const q = clamp(quantize(next, step), min, max);
    liveRef.current = q;
    onChange(q);
  };

  const commit = (next: number) => {
    const q = clamp(quantize(next, step), min, max);
    liveRef.current = q;
    onCommit(q);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (editing || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startValue: value,
      moved: false,
      shift: e.shiftKey,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dy = drag.startY - e.clientY;
    if (Math.abs(dy) >= DRAG_THRESHOLD_PX) drag.moved = true;
    if (!drag.moved) return;
    const range = max - min;
    const factor = e.shiftKey || drag.shift ? FINE_FACTOR : 1;
    const delta = (dy / DRAG_PIXELS_PER_RANGE) * range * factor;
    const fine = fineStep ?? step * FINE_FACTOR;
    const useStep = e.shiftKey || drag.shift ? fine : step;
    applyLive(clamp(quantize(drag.startValue + delta, useStep), min, max));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (drag.moved) {
      commit(liveRef.current);
      return;
    }
    // Click without drag: keep focus on the dial (edit via value button / Enter).
  };

  const onDoubleClick = () => {
    dragRef.current = null;
    setEditing(false);
    commit(defaultValue);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const fine = fineStep ?? step * FINE_FACTOR;
    const useStep = e.shiftKey ? fine : step;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      commit(clamp(value + useStep, min, max));
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      commit(clamp(value - useStep, min, max));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      commit(min);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      commit(max);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setDraft(displayValue);
      setEditing(true);
    }
  };

  const finishEdit = (raw: string) => {
    setEditing(false);
    const parsed = parseDisplay(raw);
    if (parsed == null || !Number.isFinite(parsed)) {
      setDraft(displayValue);
      return;
    }
    commit(clamp(parsed, min, max));
  };

  const angle = valueToAngle(value, min, max);
  const rootClass = ["mix-knob", className].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      <div
        ref={knobRef}
        className="mix-knob-dial"
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(4))}
        aria-valuetext={valueText}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
      >
        <span
          className="mix-knob-indicator"
          style={{ transform: `rotate(${angle}deg)` }}
          aria-hidden
        />
      </div>
      {editing ? (
        <input
          className="mix-knob-input"
          value={draft}
          aria-label={ariaLabel}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finishEdit(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              finishEdit(draft);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
              setDraft(displayValue);
            }
          }}
        />
      ) : (
        <button
          type="button"
          id={labelId}
          className="mix-knob-value"
          onClick={() => {
            setDraft(displayValue);
            setEditing(true);
          }}
        >
          {displayValue}
        </button>
      )}
    </div>
  );
}
