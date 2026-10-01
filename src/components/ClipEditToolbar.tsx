import { t } from "../ui/i18n";

export const CLIP_EDIT_TOOLS = ["select", "cut", "fade", "marker"] as const;
export type ClipEditTool = (typeof CLIP_EDIT_TOOLS)[number];

const TOOL_SHORTCUT: Record<ClipEditTool, string> = {
  select: "V",
  cut: "C",
  fade: "F",
  marker: "M",
};

export type ClipEditToolbarProps = {
  editTool: ClipEditTool;
  onEditToolChange: (tool: ClipEditTool) => void;
  className?: string;
};

export function clipEditToolFromKey(key: string): ClipEditTool | null {
  const k = key.length === 1 ? key.toLowerCase() : key;
  switch (k) {
    case "v":
      return "select";
    case "c":
      return "cut";
    case "f":
      return "fade";
    case "m":
      return "marker";
    default:
      return null;
  }
}

export function ClipEditToolbar({
  editTool,
  onEditToolChange,
  className,
}: ClipEditToolbarProps) {
  const rootClass = ["clip-edit-toolbar", className].filter(Boolean).join(" ");
  return (
    <div
      className={rootClass}
      role="toolbar"
      aria-label={t("production.edit.title")}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const index = CLIP_EDIT_TOOLS.indexOf(editTool);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? CLIP_EDIT_TOOLS.length - 1
              : (index +
                  (event.key === "ArrowLeft"
                    ? CLIP_EDIT_TOOLS.length - 1
                    : 1)) %
                CLIP_EDIT_TOOLS.length;
        onEditToolChange(CLIP_EDIT_TOOLS[next]);
        event.currentTarget
          .querySelectorAll<HTMLButtonElement>("button")
          [next]?.focus();
      }}
    >
      {CLIP_EDIT_TOOLS.map((tool) => {
        const shortcut = TOOL_SHORTCUT[tool];
        return (
          <button
            key={tool}
            type="button"
            className="btn"
            aria-pressed={editTool === tool}
            tabIndex={editTool === tool ? 0 : -1}
            aria-keyshortcuts={shortcut}
            onClick={() => onEditToolChange(tool)}
          >
            <span className="clip-edit-tool-check" aria-hidden="true">
              {editTool === tool ? "✓" : ""}
            </span>
            <span>{t(`production.edit.${tool}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
