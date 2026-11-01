import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useMapProviderContext } from './context';
import type { MapModalSlotProps, MapSheetSlotProps } from './overlay-types';

const FallbackModal: React.FC<MapModalSlotProps> = ({ visible, children, testID }) => {
  const { theme } = useMapProviderContext();
  return visible ? (
    <View style={StyleSheet.flatten([styles.modal, { backgroundColor: theme.background }])} accessibilityViewIsModal={true} testID={testID}>
      {children}
    </View>
  ) : null;
};

const FallbackSheet: React.FC<MapSheetSlotProps> = ({ isOpen, onClose, snapPoints, children, testID }) => {
  const { theme } = useMapProviderContext();
  const heightPercent = Math.min(95, Math.max(20, snapPoints?.[0] ?? 67));
  return isOpen ? (
    <View style={styles.sheetRoot} testID={testID}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" testID={testID ? `${testID}-backdrop` : undefined} />
      <View style={StyleSheet.flatten([styles.sheet, { backgroundColor: theme.background, maxHeight: `${heightPercent}%` }])} accessibilityViewIsModal={true}>
        <ScrollView contentContainerStyle={styles.sheetContent}>{children}</ScrollView>
      </View>
    </View>
  ) : null;
};

/** A full-screen modal through the app's `Modal` slot (fallback: absolute overlay). */
export const MapModal: React.FC<MapModalSlotProps> = (props) => {
  const { overlays } = useMapProviderContext();
  const Slot = overlays.Modal ?? FallbackModal;
  return <Slot {...props} />;
};

/** A bottom sheet through the app's `Sheet` slot (fallback: absolute bottom panel). */
export const MapSheet: React.FC<MapSheetSlotProps> = (props) => {
  const { overlays } = useMapProviderContext();
  const Slot = overlays.Sheet ?? FallbackSheet;
  return <Slot {...props} />;
};

const FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

const styles = StyleSheet.create({
  modal: {
    ...FILL,
    zIndex: 1000,
  },
  sheetRoot: {
    ...FILL,
    zIndex: 1000,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...FILL,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  sheetContent: {
    padding: 16,
  },
});
