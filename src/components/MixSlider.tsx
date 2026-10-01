import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

export type MixSliderProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  fineStep?: number;
  defaultValue: number;
  ariaLabel: string;
  valueText: string;
  displayValue: string;
  parseDisplay: (raw: string) => number | null;
  onChange: (next: number) => void;
  onCommit: (next: number) => void;
  className?: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function quantize(n: number, step: number): number {
  if (step <= 0) return n;
  return Number((Math.round(n / step) * step).toFixed(6));
}

/**
 * Horizontal gain/pan control aligned with the Production maquette
 * (dense slider + editable value). Same commit semantics as MixKnob.
 */
export function MixSlider({
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
}: MixSliderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayValue);
  const liveRef = useRef(value);
  liveRef.current = value;

  useEffect(() => {
    if (!editing) setDraft(displayValue);
  }, [displayValue, editing]);

  const commit = (next: number) => {
    const q = clamp(quantize(next, step), min, max);
    liveRef.current = q;
    onCommit(q);
  };

  const live = (next: number) => {
    const q = clamp(quantize(next, step), min, max);
    liveRef.current = q;
    onChange(q);
  };

  const onRangeInput = (e: ChangeEvent<HTMLInputElement>) => {
    live(Number(e.target.value));
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

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (editing) return;
    const fine = fineStep ?? step / 10;
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
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      commit(defaultValue);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      setDraft(displayValue);
      setEditing(true);
    }
  };

  const rootClass = ["mix-slider", className].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      <input
        type="range"
        className="mix-slider-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        aria-valuetext={valueText}
        onChange={onRangeInput}
        onPointerUp={() => commit(liveRef.current)}
        onPointerCancel={() => commit(liveRef.current)}
        onKeyDown={onKeyDown}
        onDoubleClick={() => commit(defaultValue)}
      />
      {editing ? (
        <input
          className="mix-slider-input mix-knob-input"
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
          className="mix-slider-value mix-knob-value"
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
