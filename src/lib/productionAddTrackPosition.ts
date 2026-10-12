type TriggerBounds = Pick<DOMRect, "left" | "top" | "bottom">;

export type ProductionAddTrackPosition = { left: number; top: number };

/** Keep the Studio add-track panel inside the viewport near its trigger. */
export function getProductionAddTrackPosition(
  trigger: TriggerBounds,
  dialogWidth: number,
  dialogHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): ProductionAddTrackPosition {
  const margin = Math.min(16, Math.max(0, viewportWidth / 2), Math.max(0, viewportHeight / 2));
  const width = Math.max(0, Math.min(dialogWidth, viewportWidth - margin * 2));
  const height = Math.max(0, Math.min(dialogHeight, viewportHeight - margin * 2));
  const maxLeft = Math.max(margin, viewportWidth - width - margin);
  const left = Math.min(Math.max(margin, trigger.left), maxLeft);

  const below = trigger.bottom + 8;
  const above = trigger.top - height - 8;
  let top: number;
  if (below + height <= viewportHeight - margin) {
    top = below;
  } else if (above >= margin) {
    top = above;
  } else {
    top = Math.max(margin, viewportHeight - height - margin);
  }

  return { left, top };
}
