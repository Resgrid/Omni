/**
 * Department colours (status, staffing, category) with black or white text that reads on them (Unit `lib/utils`).
 * TODO(omni): move to @resgrid/ui beside the theme helpers.
 */

const parseOpaqueRgb = (color: string): number[] | undefined => {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
  }
  // A translucent colour's contrast depends on what is behind it, so only an alpha of 1 counts.
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i.exec(color);
  if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) < 1)) return undefined;
  const channels = [rgb[1], rgb[2], rgb[3]].map(Number);
  return channels.every((c) => c <= 255) ? channels : undefined;
};

/** Black or white, whichever has the higher WCAG contrast on `color`; undefined when the colour cannot be read. */
export const readableTextColor = (color: string): '#000000' | '#FFFFFF' | undefined => {
  const channels = parseOpaqueRgb(color.trim());
  if (!channels) return undefined;
  const [r, g, b] = channels.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.179 ? '#000000' : '#FFFFFF';
};

export interface ReadableColors {
  backgroundColor: string;
  textColor: '#000000' | '#FFFFFF';
}

/** The background for a server colour and the text that reads on it; unreadable colours fall back to `fallback`. */
export const readableColors = (color: string | null | undefined, fallback = '#808080'): ReadableColors => {
  const value = color?.trim() ?? '';
  const textColor = readableTextColor(value);
  if (!textColor) return { backgroundColor: fallback, textColor: readableTextColor(fallback) ?? '#000000' };
  // React Native only draws a hex colour that has its leading #.
  return { backgroundColor: /^[0-9a-f]+$/i.test(value) ? `#${value}` : value, textColor };
};
