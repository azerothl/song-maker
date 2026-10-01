export type ProductionClipSelection = {
  trackId: string;
  clipId: string;
} | null;

type Listener = () => void;

let selection: ProductionClipSelection = null;
const listeners = new Set<Listener>();

function notify() {
  for (const fn of listeners) fn();
}

export function getProductionClipSelection(): ProductionClipSelection {
  return selection;
}

export function setProductionClipSelection(next: ProductionClipSelection): void {
  if (
    selection?.trackId === next?.trackId &&
    selection?.clipId === next?.clipId
  ) {
    return;
  }
  selection = next;
  notify();
}

export function subscribeProductionClipSelection(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
