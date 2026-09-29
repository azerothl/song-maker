import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type TruncatedTrackLabelProps = {
  className?: string;
  fullTitle: string;
  children: ReactNode;
};

/** Infobulle native uniquement si le libellé est visuellement tronqué. */
export function TruncatedTrackLabel({
  className,
  fullTitle,
  children,
}: TruncatedTrackLabelProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setTruncated(el.scrollWidth > el.clientWidth + 1);
  }, [fullTitle, children]);

  return (
    <span ref={ref} className={className} title={truncated ? fullTitle : undefined}>
      {children}
    </span>
  );
}
