/**
 * Mesure contraste `.btn.primary` depuis styles calculés (injecté par capture.mts).
 */
(function () {
  const AA_MIN = 4.5;
  const AA_MIN_DISABLED = 3;
  const GRADIENT_STOP_RE =
    /(?:rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)|color\(\s*srgb[\s\d./]+\)|#[0-9a-f]{3,8})/gi;

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
    if (/^(oklab|oklch|lab|lch|color)\(/i.test(raw)) {
      const probe = document.createElement("div");
      probe.style.cssText = `position:fixed;left:-9999px;background:${raw}`;
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      if (resolved && resolved !== raw) return parseRgb(resolved);
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

  function pageBackground() {
    const root = getComputedStyle(document.documentElement);
    const bg0 = root.getPropertyValue("--bg0").trim() || "#0c0e18";
    const resolved = parseRgb(resolveBackground(bg0));
    return resolved || { r: 12, g: 14, b: 24, a: 1 };
  }

  function backdropBehindOutline(btn) {
    let el = btn.parentElement;
    while (el && el !== document.documentElement) {
      const style = getComputedStyle(el);
      const bg = parseRgb(style.backgroundColor);
      if (bg && bg.a > 0.05) {
        const pageBg = pageBackground();
        return blend(bg, pageBg, bg.a);
      }
      el = el.parentElement;
    }
    const pageBg = pageBackground();
    return { r: pageBg.r, g: pageBg.g, b: pageBg.b };
  }

  function parseGradientStops(backgroundImage) {
    if (!backgroundImage || backgroundImage === "none") return [];
    return backgroundImage.match(GRADIENT_STOP_RE) ?? [];
  }

  function rgbToLab(r, g, b) {
    let rs = r / 255;
    let gs = g / 255;
    let bs = b / 255;
    rs = rs <= 0.04045 ? rs / 12.92 : ((rs + 0.055) / 1.055) ** 2.4;
    gs = gs <= 0.04045 ? gs / 12.92 : ((gs + 0.055) / 1.055) ** 2.4;
    bs = bs <= 0.04045 ? bs / 12.92 : ((bs + 0.055) / 1.055) ** 2.4;
    const x = (rs * 0.4124 + gs * 0.3576 + bs * 0.1805) / 0.95047;
    const y = rs * 0.2126 + gs * 0.7152 + bs * 0.0722;
    const z = (rs * 0.0193 + gs * 0.1192 + bs * 0.9505) / 1.08883;
    const fx = x > 0.008856 ? x ** (1 / 3) : 7.787 * x + 16 / 116;
    const fy = y > 0.008856 ? y ** (1 / 3) : 7.787 * y + 16 / 116;
    const fz = z > 0.008856 ? z ** (1 / 3) : 7.787 * z + 16 / 116;
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }

  function deltaE00(rgb1, rgb2) {
    const lab1 = rgbToLab(rgb1.r, rgb1.g, rgb1.b);
    const lab2 = rgbToLab(rgb2.r, rgb2.g, rgb2.b);
    const avgL = (lab1.L + lab2.L) / 2;
    const C1 = Math.hypot(lab1.a, lab1.b);
    const C2 = Math.hypot(lab2.a, lab2.b);
    const avgC = (C1 + C2) / 2;
    const G =
      0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
    const a1p = lab1.a * (1 + G);
    const a2p = lab2.a * (1 + G);
    const C1p = Math.hypot(a1p, lab1.b);
    const C2p = Math.hypot(a2p, lab2.b);
    const avgCp = (C1p + C2p) / 2;
    let h1p = Math.atan2(lab1.b, a1p) * (180 / Math.PI);
    if (h1p < 0) h1p += 360;
    let h2p = Math.atan2(lab2.b, a2p) * (180 / Math.PI);
    if (h2p < 0) h2p += 360;
    let dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    if (dhp < -180) dhp += 360;
    const dLp = lab2.L - lab1.L;
    const dCp = C2p - C1p;
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);
    const T =
      1 -
      0.17 * Math.cos(((h1p + h2p) / 2 - 30) * (Math.PI / 180)) +
      0.24 * Math.cos((h1p + h2p) * (Math.PI / 180)) +
      0.32 * Math.cos(((h1p + h2p) / 2 + 6) * (Math.PI / 180)) -
      0.2 * Math.cos((h1p + h2p - 63) * (Math.PI / 180));
    const Sl = 1 + (0.015 * (avgL - 50) ** 2) / Math.sqrt(20 + (avgL - 50) ** 2);
    const Sc = 1 + 0.045 * avgCp;
    const Sh = 1 + 0.015 * avgCp * T;
    const dRo =
      30 * Math.exp(-((((h1p + h2p) / 2 - 275) / 25) ** 2));
    const Rc =
      2 *
      Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7)) *
      Math.sin((dRo * Math.PI) / 180);
    const Rt =
      -Rc *
      Math.sqrt(dCp ** 2 / (Sc ** 2) + dHp ** 2 / (Sh ** 2)) *
      Math.sin(2 * dRo * (Math.PI / 180));
    return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt);
  }

  function sampleButtonFace(sel) {
    const btn = document.querySelector(sel);
    if (!btn) throw new Error(`bouton introuvable : ${sel}`);
    const style = getComputedStyle(btn);
    const disabled = btn.matches(":disabled");
    let bgCss;
    if (disabled) {
      const stops = parseGradientStops(style.backgroundImage);
      if (stops.length > 0) {
        bgCss = resolveBackground(stops[0]);
      } else {
        bgCss = resolveBackground(style.backgroundColor);
      }
    } else if (style.backgroundImage && style.backgroundImage !== "none") {
      const stops = parseGradientStops(style.backgroundImage);
      bgCss = stops.length > 0
        ? resolveBackground(stops[0])
        : resolveBackground(style.backgroundColor);
    } else {
      bgCss = resolveBackground(style.backgroundColor);
    }
    const bg = parseRgb(bgCss);
    const border = parseRgb(style.borderTopColor);
    return {
      backgroundCss: bgCss,
      backgroundHex: bg ? toHex(bg.r, bg.g, bg.b) : null,
      borderCss: style.borderTopColor,
      borderHex: border ? toHex(border.r, border.g, border.b) : null,
      backgroundRgb: bg,
      borderRgb: border,
      borderStyle: style.borderTopStyle,
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

    const pageBg = pageBackground();
    const composedFg = blend(fg, pageBg, Number.isFinite(opacity) ? opacity : 1);
    const disabled = btn.matches(":disabled");
    const minRatioRequired = disabled ? AA_MIN_DISABLED : AA_MIN;

    const stopCssList = parseGradientStops(style.backgroundImage);
    let stops;
    if (stopCssList.length > 0) {
      stops = stopCssList.map((cssValue, i) => {
        const resolved = resolveBackground(cssValue);
        const bg = parseRgb(resolved);
        if (!bg) throw new Error(`fond illisible : ${cssValue}`);
        const composedBg = blend(bg, pageBg, Number.isFinite(opacity) ? opacity : 1);
        const ratio = Math.round(contrast(composedFg, composedBg) * 100) / 100;
        return {
          stop: stopCssList.length === 2 ? (i === 0 ? "top" : "bottom") : `stop-${i}`,
          backgroundCss: cssValue,
          backgroundHex: toHex(bg.r, bg.g, bg.b),
          ratio,
          pass: ratio >= minRatioRequired,
        };
      });
    } else {
      const bgCss = style.backgroundColor;
      const resolved = resolveBackground(bgCss);
      const bg = parseRgb(resolved);
      if (!bg) throw new Error(`fond plat illisible : ${bgCss}`);
      const composedBg = blend(bg, pageBg, Number.isFinite(opacity) ? opacity : 1);
      const ratio = Math.round(contrast(composedFg, composedBg) * 100) / 100;
      stops = [
        {
          stop: "flat",
          backgroundCss: bgCss,
          backgroundHex: toHex(bg.r, bg.g, bg.b),
          ratio,
          pass: ratio >= minRatioRequired,
        },
      ];
    }

    let focusProof;
    if (stateName === "focus") {
      const outline = parseRgb(style.outlineColor);
      const backdrop = backdropBehindOutline(btn);
      focusProof = {
        matchesFocusVisible: btn.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        outlineOffset: style.outlineOffset,
        cursor: style.cursor,
        mouseAway: true,
        backdropHex: toHex(backdrop.r, backdrop.g, backdrop.b),
        outlineContrastRatio:
          outline && backdrop
            ? Math.round(contrast(outline, backdrop) * 100) / 100
            : null,
      };
    }

    return {
      state: stateName,
      foregroundCss: fgCss,
      foregroundHex: toHex(fg.r, fg.g, fg.b),
      opacity: Number.isFinite(opacity) ? opacity : 1,
      stops,
      minRatio: Math.min(...stops.map((s) => s.ratio)),
      pass: stops.every((s) => s.pass),
      focusProof,
      disabledProof: disabled
        ? { nativeDisabled: true }
        : stateName === "disabled"
          ? { nativeDisabled: false, note: "disabled attribute forced for style read" }
          : undefined,
    };
  }

  function measurePopinDisabledVsSecondary(primarySel, secondarySel) {
    const secondaryBtn = document.querySelector(secondarySel);
    if (!secondaryBtn) throw new Error(`secondaire introuvable : ${secondarySel}`);
    const secondaryStyle = getComputedStyle(secondaryBtn);
    const secondaryBg = parseRgb(resolveBackground("var(--bg2)"));
    const secondaryBorder = parseRgb(secondaryStyle.borderTopColor);
    const primaryBtn = document.querySelector(primarySel);
    if (!primaryBtn) throw new Error(`primaire introuvable : ${primarySel}`);
    const primaryStyle = getComputedStyle(primaryBtn);
    const primary = sampleButtonFace(primarySel);
    if (!primary.backgroundRgb || !secondaryBg) {
      throw new Error("couleurs de fond illisibles pour ΔE00");
    }
    const deltaE00Face =
      Math.round(deltaE00(primary.backgroundRgb, secondaryBg) * 100) / 100;
    let deltaE00Border = null;
    if (primary.borderRgb && secondaryBorder) {
      deltaE00Border =
        Math.round(deltaE00(primary.borderRgb, secondaryBorder) * 100) / 100;
    }
    let borderContrastRatio = null;
    if (primary.borderRgb) {
      const pageBg = pageBackground();
      borderContrastRatio =
        Math.round(contrast(primary.borderRgb, pageBg) * 100) / 100;
    }
    return {
      primarySel,
      secondarySel,
      primaryFaceHex: primary.backgroundHex,
      secondaryFaceHex: secondaryBg ? toHex(secondaryBg.r, secondaryBg.g, secondaryBg.b) : null,
      primaryBorderHex: primary.borderHex,
      secondaryBorderHex: secondaryBorder
        ? toHex(secondaryBorder.r, secondaryBorder.g, secondaryBorder.b)
        : null,
      primaryBorderStyle: primaryStyle.borderTopStyle,
      secondaryBorderStyle: secondaryStyle.borderTopStyle,
      deltaE00Face,
      deltaE00Border,
      borderContrastRatio,
      bordersMatch:
        primary.borderHex != null &&
        secondaryBorder != null &&
        primary.borderHex === toHex(secondaryBorder.r, secondaryBorder.g, secondaryBorder.b) &&
        primaryStyle.borderTopStyle === secondaryStyle.borderTopStyle,
    };
  }

  window.__measurePrimaryBtnState = measureCurrent;
  window.__measurePopinDisabledVsSecondary = measurePopinDisabledVsSecondary;
})();
