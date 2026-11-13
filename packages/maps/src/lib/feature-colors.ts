import { z } from 'zod';

/**
 * Per-feature colours for department GeoJSON layers. Imported KML / KMZ / GeoJSON features carry their own `color`
 * (Core sends #rrggbb); drawn layers and older imports carry none, or something MapLibre cannot read. A colour MapLibre
 * cannot parse makes the whole style expression fail for that feature (it draws black or not at all), so each feature's
 * colour is checked here and resolved once, falling back to the layer's colour, then the theme's.
 */

/** The property the map layers draw with (each feature's checked colour, else the fallback). */
export const RESOLVED_COLOR_PROPERTY = 'rgColor';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// Each component is a signed number with at least one digit (and an optional %): a bare sign or dot is not a number.
const FUNCTIONAL = /^(?:rgba?|hsla?)\(\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?(?:\s*[,\s/]\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?){2,3}\s*\)$/i;

/** True for a colour MapLibre reads the same on native and web: hex (3, 4, 6, 8 digits) or rgb(a) / hsl(a). */
export const isMapColor = (value: string | null | undefined): value is string => !!value && (HEX.test(value.trim()) || FUNCTIONAL.test(value.trim()));

/** The checked colour, or null. */
export const toMapColor = (value: string | null | undefined): string | null => (isMapColor(value) ? value.trim() : null);

const colorText = z.string().optional().catch(undefined);
const featureColorSchema = z.object({ color: colorText, Color: colorText, layerColor: colorText });

/** A feature's own readable colour (lowercase `color` as Core writes it, else PascalCase), or null. */
const ownColor = (properties: GeoJSON.GeoJsonProperties): string | null => {
  const parsed = featureColorSchema.safeParse(properties ?? {});

  return parsed.success ? (toMapColor(parsed.data.color) ?? toMapColor(parsed.data.Color)) : null;
};

/** The readable colour of the layer Core tagged an offline bundle feature with (`layerColor`), or null. */
const taggedLayerColor = (properties: GeoJSON.GeoJsonProperties): string | null => {
  const parsed = featureColorSchema.safeParse(properties ?? {});

  return parsed.success ? toMapColor(parsed.data.layerColor) : null;
};

/**
 * A copy of the offline bundle's `layers` section where each feature carries `rgColor` when it has a readable colour: its
 * own `color`, else its layer's `layerColor`. A feature with neither carries none and is drawn in the theme colour; an
 * `rgColor` the bundle itself sends is dropped, never trusted.
 */
export function withCheckedLayerColors(collection: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const features = collection.features.map((feature) => {
    const { [RESOLVED_COLOR_PROPERTY]: _untrusted, ...properties } = feature.properties ?? {};
    const color = ownColor(feature.properties) ?? taggedLayerColor(feature.properties);

    return { ...feature, properties: color ? { ...properties, [RESOLVED_COLOR_PROPERTY]: color } : properties };
  });

  return { ...collection, features };
}

/**
 * A copy of the collection where every feature carries `rgColor`: its own `color` when readable, else `fallback`. The
 * input is not changed; a null or empty collection comes back as is.
 */
export function withResolvedFeatureColors<T extends GeoJSON.FeatureCollection | null | undefined>(collection: T, fallback: string): T {
  if (!collection || collection.features.length === 0) return collection;
  const features = collection.features.map((feature) => ({ ...feature, properties: { ...(feature.properties ?? {}), [RESOLVED_COLOR_PROPERTY]: ownColor(feature.properties) ?? fallback } }));

  // SAFETY: only `features` changes, element for element, so the result keeps the input's FeatureCollection type.
  return { ...collection, features } as T;
}
