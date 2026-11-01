/**
 * Readable colours for call cards drawn on the department's priority colour (Responder `readableColors`).
 * Pure: no theme access, so BigBoard wall rows and phone cards agree on the same contrast rule.
 */

export const DEFAULT_CALL_COLOR = '#808080';

/** The 0-255 [r, g, b] of a 3- or 6-digit hex colour (the # optional) or an opaque rgb()/rgba(). */
function parseOpaqueRgb(color: string): number[] | undefined {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
  }
  // A translucent colour's contrast depends on what is drawn behind it, so only an alpha of 1 counts.
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i.exec(color);
  if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) < 1)) return undefined;
  const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
  return channels.every((c) => c <= 255) ? channels : undefined;
}

/** Black or white, whichever has the higher WCAG contrast against `color`; undefined for an unreadable value. */
export function readableTextColor(color: string): '#000000' | '#FFFFFF' | undefined {
  const channels = parseOpaqueRgb(color.trim());
  if (!channels) return undefined;
  const [r, g, b] = channels.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast with black is (L + 0.05) / 0.05 and with white 1.05 / (L + 0.05); they are equal at L ≈ 0.179.
  return luminance > 0.179 ? '#000000' : '#FFFFFF';
}

export interface ReadableColors {
  backgroundColor: string;
  textColor: '#000000' | '#FFFFFF';
}

/** A background React Native can draw (leading # added to bare hex) and the text colour that reads on it. */
export function readableColors(color: string | null | undefined, fallback = DEFAULT_CALL_COLOR): ReadableColors {
  const value = color?.trim() ?? '';
  const textColor = readableTextColor(value);
  if (!textColor) return { backgroundColor: fallback, textColor: readableTextColor(fallback) ?? '#000000' };
  return { backgroundColor: /^[0-9a-f]+$/i.test(value) ? `#${value}` : value, textColor };
}
