type Props = {
  label: string;
  onClick: () => void;
  className?: string;
};

/** Icon-only close control for anchored popovers (Loïc 2026-10-02). */
export function PopinCloseButton({ label, onClick, className }: Props) {
  return (
    <button
      type="button"
      className={["btn", "anchored-popin-close", className].filter(Boolean).join(" ")}
      aria-label={label}
      onClick={onClick}
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}
