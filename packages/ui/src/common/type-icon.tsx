import { Image as ExpoImage } from 'expo-image';
import React, { createContext, useContext, useState } from 'react';
import { Image as RNImage, type ImageSourcePropType, type ImageStyle, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

/** One bundled map icon (the MAP_ICONS shape the maps package owns). */
export interface TypeMapIconEntry {
  imgName: string;
  uri: ImageSourcePropType;
}

export type TypeMapIconRegistry = Readonly<Record<string, TypeMapIconEntry>>;

const EMPTY_REGISTRY: TypeMapIconRegistry = {};

/**
 * The bundled map icons TypeIcon may fall back to. @resgrid/ui cannot import the map assets (they live in a
 * higher layer), so the app shell provides them once: `<TypeMapIconProvider icons={MAP_ICONS}>`.
 */
const TypeMapIconContext = createContext<TypeMapIconRegistry>(EMPTY_REGISTRY);

export function TypeMapIconProvider({ icons, children }: { icons: TypeMapIconRegistry; children?: React.ReactNode }) {
  return <TypeMapIconContext.Provider value={icons}>{children}</TypeMapIconContext.Provider>;
}

/**
 * The uploaded icon URL a department gave a unit, call or POI type (Core's `TypeIconUrl` / `IconUrl` fields)
 * when it is usable, otherwise null. Only absolute http(s) URLs are accepted: the server sends an absolute,
 * anonymous, immutable image URL, and anything else (blank, relative, another scheme) is treated as "no upload".
 */
export const getTypeIconUrl = (iconUrl?: string | null): string | null => {
  if (typeof iconUrl !== 'string') return null;
  const trimmed = iconUrl.trim();
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
};

/** Normalizes a type's map icon name (Core's `TypeMapIcon` / `MapIcon`) the way map pin tokens are: lowercase, no spaces or dashes. */
export const normalizeMapIconKey = (mapIcon?: string | null): string | null => {
  if (typeof mapIcon !== 'string') return null;
  const key = mapIcon
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '');
  return key.length > 0 ? key : null;
};

/** The bundled map icon a type picked, or undefined when the name is blank or unknown to this build. */
export const getTypeMapIcon = (mapIcon: string | null | undefined, icons: TypeMapIconRegistry): TypeMapIconEntry | undefined => {
  const key = normalizeMapIconKey(mapIcon);
  if (!key || !Object.prototype.hasOwnProperty.call(icons, key)) return undefined;
  return icons[key];
};

export interface TypeIconProps {
  /** The department's uploaded icon for the type or role (absolute URL, anonymous GET); null when none was uploaded. */
  iconUrl?: string | null;
  /** The built-in map icon the type picked (a MAP_ICONS key such as "ambulance" or "fire"); null when none. */
  mapIcon?: string | null;
  /** Overrides the provider's bundled icon registry. */
  mapIcons?: TypeMapIconRegistry;
  /** Edge length of the square the icon is fitted into. */
  size?: number;
  /**
   * How the image is fitted into the square: "contain" (the default) for an uploaded square icon, "cover" for
   * a remote copy of a bundled pin that must sit exactly where the bundled image would.
   */
  contentFit?: 'contain' | 'cover';
  /** Rendered when neither icon is available (or both failed to load). */
  fallback?: React.ReactNode;
  /** Applied to the rendered image (not the fallback), e.g. a backdrop behind a transparent icon. */
  style?: StyleProp<ImageStyle>;
  /** Applied to the box around the rendered image (not the fallback), e.g. spacing that the fallback carries itself. */
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The icon a department gave a unit, call or POI type or a personnel role, shown beside the item's name so an
 * Ambulance reads differently from a MUG, or a structure fire from a medical call, at a glance (Dispatch/BigBoard).
 * Prefers the uploaded icon, then the built-in map icon the type picked, then `fallback` (nothing by default).
 * An image that fails to load falls through to the next option. Decorative: the name is always shown as text next
 * to it, so it is hidden from screen readers.
 */
export const TypeIcon: React.FC<TypeIconProps> = React.memo(({ iconUrl, mapIcon, mapIcons, size = 24, contentFit = 'contain', fallback = null, style, containerStyle, testID }) => {
  const registry = useContext(TypeMapIconContext);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [failedMapIcon, setFailedMapIcon] = useState<string | null>(null);

  const url = getTypeIconUrl(iconUrl);
  const mapIconEntry = getTypeMapIcon(mapIcon, mapIcons ?? registry);
  const box = { width: size, height: size };

  if (url && failedUrl !== url) {
    return (
      <View style={StyleSheet.flatten([styles.container, box, containerStyle])} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden testID={testID}>
        <ExpoImage
          source={{ uri: url }}
          style={StyleSheet.flatten([box, style])}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          recyclingKey={url}
          accessible={false}
          onError={() => setFailedUrl(url)}
          testID={testID ? `${testID}-url` : undefined}
        />
      </View>
    );
  }

  if (mapIconEntry && failedMapIcon !== mapIconEntry.imgName) {
    return (
      <View style={StyleSheet.flatten([styles.container, box, containerStyle])} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden testID={testID}>
        <RNImage
          source={mapIconEntry.uri}
          style={StyleSheet.flatten([box, style])}
          resizeMode={contentFit}
          fadeDuration={0}
          accessible={false}
          onError={() => setFailedMapIcon(mapIconEntry.imgName)}
          testID={testID ? `${testID}-map` : undefined}
        />
      </View>
    );
  }

  return <>{fallback}</>;
});

TypeIcon.displayName = 'TypeIcon';

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
