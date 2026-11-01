import type { ReactNode } from 'react';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NativeModal } from './native-modal';
import { useThemeColors } from './theme/use-theme-colors';
import { useTranslation } from './utils/i18n';

const MAX_DRAWER_WIDTH = 360;
/** Backdrop taps are ignored for this long after opening (swallows the opening tap on Android). */
export const SIDE_DRAWER_BACKDROP_ARM_DELAY_MS = 280;
const OPEN_DURATION_MS = 220;
const CLOSE_DURATION_MS = 180;

export interface SideDrawerProps {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  testID?: string;
}

/**
 * Left-anchored slide-in menu on a native Modal (IC) — the same deterministic overlay approach as
 * CustomBottomSheet. The panel is always fully on-screen when open (no motion-library enter
 * animations to get stuck at their initial off-screen offset), and tapping the dimmed backdrop
 * anywhere outside the panel dismisses it. NativeModal adds a toast host and allows all orientations.
 */
export function SideDrawer({ children, isOpen, onClose, testID }: SideDrawerProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Modal visibility is managed separately so the close animation can finish before unmount.
  const [modalVisible, setModalVisible] = useState(false);
  const hasBeenOpened = useRef(false);
  // Swallow the opening tap so it can't land on the backdrop and instantly re-close (Android).
  const [backdropEnabled, setBackdropEnabled] = useState(false);
  const backdropTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const drawerWidth = Math.min(Math.round(windowWidth * 0.8), MAX_DRAWER_WIDTH);

  const translateX = useRef(new Animated.Value(1)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Read inside the close-animation callback, which fires after the animation and would otherwise
  // see a stale `isOpen` from the render that started it. Written in a layout effect rather than
  // during render so an abandoned render can't leave the ref describing a state never committed;
  // layout effects still run before the passive effect below starts the animation.
  const isOpenRef = useRef(isOpen);
  useLayoutEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      hasBeenOpened.current = true;
      setBackdropEnabled(false);
      setModalVisible(true);
      translateX.setValue(1);
      backdropOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: OPEN_DURATION_MS, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0.5, duration: OPEN_DURATION_MS, useNativeDriver: true }),
      ]).start();

      if (backdropTimerRef.current) clearTimeout(backdropTimerRef.current);
      backdropTimerRef.current = setTimeout(() => {
        setBackdropEnabled(true);
      }, SIDE_DRAWER_BACKDROP_ARM_DELAY_MS);
    } else if (hasBeenOpened.current) {
      setBackdropEnabled(false);
      if (backdropTimerRef.current) clearTimeout(backdropTimerRef.current);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 1, duration: CLOSE_DURATION_MS, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: CLOSE_DURATION_MS, useNativeDriver: true }),
      ]).start(() => {
        // Unmount whether or not the animation finished: an interrupted close otherwise leaves a
        // transparent, full-screen Modal over the whole app that eats every touch. This drawer is
        // mounted app-wide, so that strands the user on any screen until it remounts.
        if (!isOpenRef.current) {
          setModalVisible(false);
        }
      });
    }
    return () => {
      if (backdropTimerRef.current) clearTimeout(backdropTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!modalVisible) return null;

  const panelStyle = {
    ...styles.panel,
    width: drawerWidth,
    transform: [{ translateX: translateX.interpolate({ inputRange: [0, 1], outputRange: [0, -drawerWidth] }) }],
    backgroundColor: colors.background,
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
  };

  return (
    <NativeModal visible={modalVisible} transparent animationType="none" statusBarTranslucent onRequestClose={handleClose} testID={testID}>
      {/* Backdrop — tapping anywhere outside the panel dismisses the menu */}
      <Pressable
        style={styles.fill}
        onPress={backdropEnabled ? handleClose : undefined}
        accessibilityRole="button"
        accessibilityLabel={t('common.close_menu', { defaultValue: 'Close menu' })}
        testID={testID ? `${testID}-backdrop` : undefined}
      >
        <Animated.View style={{ ...styles.backdrop, opacity: backdropOpacity }} />
      </Pressable>

      {/* Menu panel */}
      <Animated.View style={panelStyle} accessibilityViewIsModal testID={testID ? `${testID}-panel` : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {children}
        </ScrollView>
      </Animated.View>
    </NativeModal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
  scrollContent: { paddingBottom: 12 },
});
