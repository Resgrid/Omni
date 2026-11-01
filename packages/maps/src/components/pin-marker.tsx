import React, { useCallback, useState } from 'react';
import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';

import { getRemoteIconUrl } from '../lib/pin-features';
import { type MapIconSource, useMapIcons, useMapTheme } from '../provider/context';

/**
 * A call / unit / station / person marker drawn as a React view (baseline IC pin-marker + Unit active state + Dispatch
 * memo). The map draws most pins as a symbol layer (`MapPins`); this view is for the selected pin (MarkerView) and for
 * the legend, so a legend icon is exactly the marker icon.
 */

const toImageSource = (source: MapIconSource): ImageSourcePropType => (typeof source === 'string' ? { uri: source } : source);

export interface PinMarkerIconProps {
  imagePath?: string | null;
  poiImage?: string | null;
  /** Uploaded type / role icon; wins when it loads. */
  iconUrl?: string | null;
  /** Server-recoloured status / priority pin; used when there is no (working) upload. */
  pinIconUrl?: string | null;
  accentColor?: string | null;
  size?: number;
  /** False keeps the box empty instead of drawing the bundled icon (legend swatches without a bundled counterpart). */
  fallbackToBundled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/** Uploaded icon → status pin → bundled icon; a failed remote image falls back down the chain (and retries when the URL changes). */
export const PinMarkerIcon: React.FC<PinMarkerIconProps> = React.memo(({ imagePath, poiImage, iconUrl, pinIconUrl, accentColor, size = 32, fallbackToBundled = true, accessibilityLabel, testID }) => {
  const icons = useMapIcons();
  const [failedUpload, setFailedUpload] = useState<string | null>(null);
  const [failedPin, setFailedPin] = useState<string | null>(null);
  const upload = getRemoteIconUrl(iconUrl);
  const statusPin = getRemoteIconUrl(pinIconUrl);

  // Forget a failure once that URL is no longer the one asked for, so a transient 404/offline failure is retried.
  if (failedUpload !== null && failedUpload !== upload) setFailedUpload(null);
  if (failedPin !== null && failedPin !== statusPin) setFailedPin(null);

  const onUploadError = useCallback(() => setFailedUpload(upload), [upload]);
  const onPinError = useCallback(() => setFailedPin(statusPin), [statusPin]);

  const boxStyle = StyleSheet.flatten([{ width: size, height: size }, accentColor ? { borderWidth: 3, borderColor: accentColor, borderRadius: size / 2 } : null]);
  const a11y = accessibilityLabel ? { accessible: true, accessibilityLabel, accessibilityRole: 'image' as const } : null;

  if (upload && upload !== failedUpload) {
    return <Image source={{ uri: upload }} onError={onUploadError} resizeMode="contain" style={boxStyle} testID={testID ? `${testID}-upload` : 'pin-type-icon'} {...a11y} />;
  }
  if (statusPin && statusPin !== failedPin) {
    return <Image source={{ uri: statusPin }} onError={onPinError} resizeMode="cover" style={boxStyle} testID={testID ? `${testID}-pin` : 'pin-status-icon'} {...a11y} />;
  }
  const key = (poiImage?.trim() || imagePath?.trim() || '').toLowerCase();
  const bundled = icons[key] ?? icons.call;
  if (!fallbackToBundled || bundled === undefined) {
    return <View style={boxStyle} testID={testID ? `${testID}-empty` : undefined} {...a11y} />;
  }
  return <Image source={toImageSource(bundled)} resizeMode="cover" style={boxStyle} testID={testID ? `${testID}-bundled` : 'pin-bundled-icon'} {...a11y} />;
});

PinMarkerIcon.displayName = 'PinMarkerIcon';

export interface PinMarkerProps extends PinMarkerIconProps {
  title: string;
  /** Command lane name shown under the title (IC board). */
  laneLabel?: string;
  /** Selected / active pin (Unit): enlarged with a highlight ring. */
  isActive?: boolean;
  onPress?: () => void;
}

export const PinMarker: React.FC<PinMarkerProps> = React.memo(({ title, laneLabel, isActive = false, onPress, size = 32, accentColor, testID = 'pin-marker', ...icon }) => {
  const { colors } = useMapTheme();
  const iconSize = isActive ? Math.round(size * 1.25) : size;
  return (
    <Pressable onPress={onPress} style={styles.container} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected: isActive }} testID={testID}>
      <PinMarkerIcon {...icon} size={iconSize} accentColor={accentColor ?? (isActive ? colors.primary : null)} />
      <Text style={StyleSheet.flatten([styles.title, { color: colors.text, textShadowColor: colors.background }])} numberOfLines={2}>
        {title}
      </Text>
      {laneLabel ? (
        <Text style={StyleSheet.flatten([styles.lane, accentColor ? { backgroundColor: accentColor } : null])} numberOfLines={1} testID={`${testID}-lane`}>
          {laneLabel}
        </Text>
      ) : null}
    </Pressable>
  );
});

PinMarker.displayName = 'PinMarker';

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 2,
    maxWidth: 120,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    textShadowRadius: 2,
  },
  lane: {
    marginTop: 1,
    overflow: 'hidden',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#6b7280',
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
});
