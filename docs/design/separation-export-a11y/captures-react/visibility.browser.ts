/** Fonctions injectées dans le navigateur (capture + tests Playwright). */
export const VISIBILITY_BROWSER_BUNDLE = `
function __parseRgb(color) {
  const m = color.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
function __channelLinear(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function __relativeLuminance(rgb) {
  const r = __channelLinear(rgb[0]);
  const g = __channelLinear(rgb[1]);
  const b = __channelLinear(rgb[2]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function __contrastRatio(fg, bg) {
  const f = __parseRgb(fg);
  const b = __parseRgb(bg);
  if (!f || !b) return null;
  const l1 = __relativeLuminance(f);
  const l2 = __relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
function __isClippedByOverflow(el) {
  let node = el;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflow = style.overflow + style.overflowX + style.overflowY;
    if (/hidden|clip|scroll|auto/.test(overflow)) {
      const parent = node.parentElement;
      if (!parent) break;
      const pr = parent.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.bottom > pr.bottom + 0.5 || er.top < pr.top - 0.5 || er.right > pr.right + 0.5 || er.left < pr.left - 0.5) {
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}
function __measureReachability(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const inViewport = r.width > 0 && r.height > 0 && r.top >= -0.5 && r.left >= -0.5 && r.bottom <= vh + 0.5 && r.right <= vw + 0.5;
  const notClippedByOverflow = !__isClippedByOverflow(el);
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  const hitTargetMatches = Boolean(hit && (el === hit || el.contains(hit)));
  return {
    inViewport,
    notClippedByOverflow,
    hitTargetMatches,
    reachable: inViewport && notClippedByOverflow && hitTargetMatches,
    rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right },
  };
}
function __measureHorizontalOverflow(el) {
  if (!el) return { scrollWidth: 0, clientWidth: 0, ok: true };
  return {
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    ok: el.scrollWidth <= el.clientWidth + 1,
  };
}
`;
