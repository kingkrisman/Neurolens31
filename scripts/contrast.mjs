/**
 * WCAG contrast arithmetic, shared by the theme audit and its test.
 *
 * Kept separate from any file that touches the DOM so the themes can be
 * checked without a browser: there are a dozen of them, and a browser test
 * only ever measures whichever one happened to be selected.
 */

/** #rgb or #rrggbb to 0–255 triples. */
export function parseHex(hex) {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG 2.x relative luminance. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return (light + 0.05) / (dark + 0.05);
}

export function ratioOf(fgHex, bgHex) {
  const fg = parseHex(fgHex);
  const bg = parseHex(bgHex);
  if (!fg || !bg) return null;
  return contrast(fg, bg);
}

const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/**
 * Move a colour until it clears `target` against `bg`, changing it as little
 * as possible.
 *
 * The two directions are not symmetric, and using one operation for both was a
 * bug worth keeping the explanation of.
 *
 * Against a **light** background the colour has to get darker, and scaling all
 * three channels by the same factor does that while holding the hue and the
 * relative saturation — a colour nudged this way still looks like the one the
 * designer picked, where clamping channels individually does not.
 *
 * Against a **dark** background the colour has to get lighter, and scaling *up*
 * does not get there: multiplying a near-black colour by any factor leaves it
 * near-black, and `#000` stays `#000` forever. So that direction blends toward
 * white instead, which always converges because white clears every threshold
 * on a dark ground.
 *
 * Returns null only if no step reaches the target — which, given the above,
 * means the two colours are too close in luminance for any adjustment of the
 * foreground alone to fix.
 */
export function meetRatio(fgHex, bgHex, target = 4.5) {
  const fg = parseHex(fgHex);
  const bg = parseHex(bgHex);
  if (!fg || !bg) return null;
  if (contrast(fg, bg) >= target) return fgHex;

  const bgIsLight = luminance(bg) > 0.5;

  for (let step = 1; step <= 100; step += 1) {
    const amount = step / 100;
    const next = bgIsLight
      ? fg.map((channel) => Math.round(channel * (1 - amount)))
      : fg.map((channel) => Math.round(channel + (255 - channel) * amount));
    if (contrast(next, bg) >= target) return hex(next);
  }
  return null;
}
