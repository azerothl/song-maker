/**
 * Mesure contraste `.btn.primary` dans la page (injecté par capture.mts).
 * Plain JS — évite la sérialisation `__name` de tsx/esbuild via page.evaluate.
 */
(function () {
  const AA_MIN = 4.5;

  function srgbToLinear(c) {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }

  function relLum(r, g, b) {
    return (
      0.2126 * srgbToLinear(r) +
      0.7152 * srgbToLinear(g) +
      0.0722 * srgbToLinear(b)
    );
  }

  function parseRgb(css) {
    const raw = String(css).trim();
    const rgb = raw.match(
      /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)$/i,
    );
    if (rgb) {
      return {
        r: Math.round(Number(rgb[1])),
        g: Math.round(Number(rgb[2])),
        b: Math.round(Number(rgb[3])),
        a: rgb[4] != null ? Number(rgb[4]) : 1,
      };
    }
    // Chromium color-mix often resolves to color(srgb r g b) with 0–1 channels.
    const srgb = raw.match(
      /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i,
    );
    if (srgb) {
      return {
        r: Math.round(Number(srgb[1]) * 255),
        g: Math.round(Number(srgb[2]) * 255),
        b: Math.round(Number(srgb[3]) * 255),
        a: srgb[4] != null ? Number(srgb[4]) : 1,
      };
    }
    if (raw.startsWith("#")) {
      const h = raw.slice(1);
      if (h.length === 3) {
        return {
          r: parseInt(h[0] + h[0], 16),
          g: parseInt(h[1] + h[1], 16),
          b: parseInt(h[2] + h[2], 16),
          a: 1,
        };
      }
      if (h.length === 6) {
        return {
          r: parseInt(h.slice(0, 2), 16),
          g: parseInt(h.slice(2, 4), 16),
          b: parseInt(h.slice(4, 6), 16),
          a: 1,
        };
      }
    }
    return null;
  }

  function toHex(r, g, b) {
    const h = (n) => n.toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  function contrast(a, b) {
    const l1 = relLum(a.r, a.g, a.b);
    const l2 = relLum(b.r, b.g, b.b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function resolveBackground(cssValue) {
    const probe = document.createElement("div");
    probe.style.cssText = `position:fixed;left:-9999px;top:0;width:8px;height:8px;background:${cssValue}`;
    document.body.appendChild(probe);
    const bg = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return bg;
  }

  function blend(fg, bg, alpha) {
    return {
      r: Math.round(alpha * fg.r + (1 - alpha) * bg.r),
      g: Math.round(alpha * fg.g + (1 - alpha) * bg.g),
      b: Math.round(alpha * fg.b + (1 - alpha) * bg.b),
    };
  }

  function measureCurrent(sel, stateName) {
    const btn = document.querySelector(sel);
    if (!btn) throw new Error(`bouton introuvable : ${sel}`);

    const style = getComputedStyle(btn);
    const fgCss = style.color;
    const opacity = Number.parseFloat(style.opacity);
    const fg = parseRgb(fgCss);
    if (!fg) throw new Error(`couleur texte illisible : ${fgCss}`);

    const root = getComputedStyle(document.documentElement);
    const accent = root.getPropertyValue("--accent").trim() || "#c4a8ff";
    const accent2 = root.getPropertyValue("--accent-2").trim() || "#a78bfa";
    const bg0 = root.getPropertyValue("--bg0").trim() || "#0c0e18";
    const pageBg = parseRgb(resolveBackground(bg0)) || {
      r: 12,
      g: 14,
      b: 24,
    };

    const stopSpecs =
      stateName === "disabled"
        ? [
            ["disabled-top", "color-mix(in srgb, var(--accent) 62%, white)"],
            [
              "disabled-bottom",
              "color-mix(in srgb, var(--accent-2) 62%, white)",
            ],
          ]
        : [
            ["accent", accent],
            ["accent-2", accent2],
          ];

    const stops = stopSpecs.map(([stop, cssValue]) => {
      const bgCss = resolveBackground(cssValue);
      const bg = parseRgb(bgCss);
      if (!bg) throw new Error(`fond illisible : ${bgCss}`);
      const ratio =
        Math.round(
          contrast(blend(fg, pageBg, opacity), blend(bg, pageBg, opacity)) *
            100,
        ) / 100;
      return {
        stop,
        backgroundCss: bgCss,
        backgroundHex: toHex(bg.r, bg.g, bg.b),
        ratio,
        pass: ratio >= AA_MIN,
      };
    });

    return {
      state: stateName,
      foregroundCss: fgCss,
      foregroundHex: toHex(fg.r, fg.g, fg.b),
      opacity,
      stops,
      minRatio: Math.min(...stops.map((s) => s.ratio)),
      pass: stops.every((s) => s.pass),
    };
  }

  window.__measurePrimaryBtnState = measureCurrent;
})();
