import type { LayerType } from './types';

/**
 * Converts the rnmapbox-style camelCase layer `style` object (`{ lineColor, lineWidth, iconImage }`) into MapLibre
 * style-spec `paint` and `layout` objects (`{ 'line-color': …, 'icon-image': … }`). Both renderers use it: maplibre-gl
 * only understands the spec form, and MapLibre React Native 11 deprecates its camelCase `style` prop in favour of
 * `paint` / `layout` (removed in v12).
 */

export type StyleObject = Record<string, unknown>;

export interface PaintAndLayout {
  paint: StyleObject;
  layout: StyleObject;
}

/** Layout (not paint) properties per the MapLibre style spec v8; everything else is paint. */
const LAYOUT_PROPERTIES = new Set<string>([
  'visibility',
  'fill-sort-key',
  'line-cap',
  'line-join',
  'line-miter-limit',
  'line-round-limit',
  'line-sort-key',
  'circle-sort-key',
  'symbol-placement',
  'symbol-spacing',
  'symbol-avoid-edges',
  'symbol-sort-key',
  'symbol-z-order',
  'icon-allow-overlap',
  'icon-overlap',
  'icon-ignore-placement',
  'icon-optional',
  'icon-rotation-alignment',
  'icon-size',
  'icon-text-fit',
  'icon-text-fit-padding',
  'icon-image',
  'icon-rotate',
  'icon-padding',
  'icon-keep-upright',
  'icon-offset',
  'icon-anchor',
  'icon-pitch-alignment',
  'text-pitch-alignment',
  'text-rotation-alignment',
  'text-field',
  'text-font',
  'text-size',
  'text-max-width',
  'text-line-height',
  'text-letter-spacing',
  'text-justify',
  'text-radial-offset',
  'text-variable-anchor',
  'text-variable-anchor-offset',
  'text-anchor',
  'text-max-angle',
  'text-writing-mode',
  'text-rotate',
  'text-padding',
  'text-keep-upright',
  'text-transform',
  'text-offset',
  'text-allow-overlap',
  'text-overlap',
  'text-ignore-placement',
  'text-optional',
]);

/** Translate values may arrive as `{ x, y }` (MapLibre RN) — the spec wants `[x, y]`. */
const TRANSLATE_PROPERTIES = new Set<string>(['fill-translate', 'line-translate', 'circle-translate', 'icon-translate', 'text-translate', 'fill-extrusion-translate']);

/** `lineColor` → `line-color`, `iconTextFitPadding` → `icon-text-fit-padding`. */
export const camelToKebab = (key: string): string => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

export const isLayoutProperty = (specKey: string): boolean => LAYOUT_PROPERTIES.has(specKey);

const isTranslationObject = (value: unknown): value is { x: number; y: number } =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as { x?: unknown }).x === 'number' && typeof (value as { y?: unknown }).y === 'number';

const normalizeValue = (specKey: string, value: unknown): unknown => (TRANSLATE_PROPERTIES.has(specKey) && isTranslationObject(value) ? [value.x, value.y] : value);

/**
 * Splits a camelCase style into spec paint/layout. `…Transition` keys become `…-transition` paint entries. Values that
 * only native can resolve (an image `require()` passed as `iconImage`) are dropped — register images through `Images`
 * and reference them by name instead.
 */
export const toPaintAndLayout = (_type: LayerType, style: object | null | undefined): PaintAndLayout => {
  const paint: StyleObject = {};
  const layout: StyleObject = {};
  if (!style) {
    return { paint, layout };
  }
  for (const [key, rawValue] of Object.entries(style)) {
    if (rawValue === undefined) {
      continue;
    }
    if (key.endsWith('Transition')) {
      paint[`${camelToKebab(key.slice(0, -'Transition'.length))}-transition`] = rawValue;
      continue;
    }
    const specKey = camelToKebab(key);
    if ((specKey.endsWith('-image') || specKey.endsWith('-pattern')) && typeof rawValue !== 'string' && !Array.isArray(rawValue)) {
      continue;
    }
    const value = normalizeValue(specKey, rawValue);
    if (isLayoutProperty(specKey)) {
      layout[specKey] = value;
    } else {
      paint[specKey] = value;
    }
  }
  return { paint, layout };
};

/** Stable string for memo comparisons of style objects passed inline (`style={{ … }}` re-creates them every render). */
export const styleSignature = (style: object | null | undefined): string => (style ? JSON.stringify(style) : '');
