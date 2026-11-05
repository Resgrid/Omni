import type { ReactNode } from 'react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Center } from './center';
import { BottomAnchoredKeyboardView } from './keyboard-avoiding-view/bottom-anchored';
import { useKeepFocusedInputVisible } from './keyboard-avoiding-view/keep-focused-input-visible';
import { NativeModal } from './native-modal';
import { Spinner } from './spinner';
import { Text } from './text';
import { useThemeColors } from './theme/use-theme-colors';
import { useTranslation } from './utils/i18n';
import { VStack } from './vstack';

export interface CustomBottomSheetProps {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
  loadingText?: string;
  /** Percentages of the window height; the first one sizes the sheet (clamped to 300 px … window − 20). */
  snapPoints?: number[];
  /** @deprecated Kept for call-site compatibility with the legacy apps; has no effect. */
  minHeight?: string;
  testID?: string;
}

/**
 * The most a sheet with this first snap point (percent of the window height) grows to: clamped to 300 px … window − 20.
 * The sheet itself is content-sized up to this height; content taller than it has to scroll.
 */
export const getBottomSheetHeight = (windowHeight: number, snapPoint = 67): number => Math.max(300, Math.min(Math.round(snapPoint * windowHeight * 0.01), windowHeight - 20));

/** Backdrop taps are ignored for this long after opening (see below). */
export const BOTTOM_SHEET_BACKDROP_ARM_DELAY_MS = 300;

/** The least space kept above a sheet the keyboard has pushed up, on a window without a status bar inset. */
export const BOTTOM_SHEET_TOP_GAP = 20;

const OPEN_DURATION_MS = 250;
const CLOSE_DURATION_MS = 200;
const BACKDROP_OPACITY = 0.5;

/**
 * Bottom sheet rendered in a native `Modal`, i.e. its own window above the app (merged from Unit and IC).
 * Toasts shown while it is open render inside that window (NativeModal carries a toast host) and all
 * orientations are allowed.
 *
 * The soft keyboard never covers it: the sheet sits on top of the keyboard while it is up, shrinks to the
 * space left above it (never under the status bar), and scrolls the focused field — a status note, a close
 * reason, a message body — into view. Content inside it scrolls with the sheet's own ScrollView; do not
 * nest a `KeyboardAwareScrollView`, which would add the keyboard's height a second time.
 *
 * A gluestack overlay (Modal, Actionsheet, Select, Menu, Popover…) opened from inside this sheet
 * must pass `useRNModal` where it supports it. By default those portal to the host at the app root,
 * which sits underneath this window, so they open hidden behind the sheet and cannot be tapped.
 */
export function CustomBottomSheet({ children, isOpen, onClose, isLoading = false, loadingText, snapPoints = [67], testID }: CustomBottomSheetProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();

  // Modal visibility is managed separately so the close animation can finish
  // before the Modal is unmounted.
  const [modalVisible, setModalVisible] = useState(false);
  // Track whether we've ever been opened so the close branch doesn't fire on mount.
  const hasBeenOpened = useRef(false);
  // Prevent the backdrop from capturing the same touch event that opened the sheet.
  // On Android, transparent Modal renders instantly and the opening tap propagates
  // to the backdrop Pressable, causing an immediate close.
  const [backdropEnabled, setBackdropEnabled] = useState(false);
  const backdropTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateY = useRef(new Animated.Value(1)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // The sheet gets shorter while the keyboard is up; this scrolls a field left below its visible part back into view.
  const keepFocusedInputVisible = useKeepFocusedInputVisible(modalVisible);

  // Read inside the close-animation callback, which fires after the animation and would otherwise
  // see a stale `isOpen` from the render that started it. Written in a layout effect rather than
  // during render so an abandoned render can't leave the ref describing a state never committed;
  // layout effects still run before the passive effect below starts the animation.
  const isOpenRef = useRef(isOpen);
  useLayoutEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Compute sheet height from first snap point (percentage of screen height).
  // Clamp between 300px and the screen height to remain usable in all orientations.
  const sheetHeight = getBottomSheetHeight(windowHeight, snapPoints.length > 0 ? snapPoints[0] : 67);

  useEffect(() => {
    if (isOpen) {
      hasBeenOpened.current = true;
      setBackdropEnabled(false);
      // Show the modal immediately, then animate in
      setModalVisible(true);
      translateY.setValue(1);
      backdropOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: OPEN_DURATION_MS, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: BACKDROP_OPACITY, duration: OPEN_DURATION_MS, useNativeDriver: true }),
      ]).start();

      // Enable backdrop taps after the animation completes so the opening
      // tap doesn't propagate to the backdrop on Android.
      if (backdropTimerRef.current) clearTimeout(backdropTimerRef.current);
      backdropTimerRef.current = setTimeout(() => {
        setBackdropEnabled(true);
      }, BOTTOM_SHEET_BACKDROP_ARM_DELAY_MS);
    } else if (hasBeenOpened.current) {
      setBackdropEnabled(false);
      if (backdropTimerRef.current) clearTimeout(backdropTimerRef.current);
      Animated.parallel([
        Animated.timing(translateY, { toValue: 1, duration: CLOSE_DURATION_MS, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: CLOSE_DURATION_MS, useNativeDriver: true }),
      ]).start(() => {
        // Tear the Modal down whether or not the animation ran to completion. An interrupted close
        // (finished === false — another animation started on these values, the app backgrounded,
        // a re-render restarted the effect) used to leave a transparent, full-screen Modal mounted
        // over the app: the screen below looked normal but swallowed every touch, so scrolling was
        // dead until the route unmounted. Guarded on the CURRENT isOpen so a close that was
        // superseded by a re-open doesn't hide a sheet the user just opened.
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

  const sheetStyle = {
    ...styles.sheet,
    maxHeight: sheetHeight,
    backgroundColor: colors.background,
    transform: [{ translateY: translateY.interpolate({ inputRange: [0, 1], outputRange: [0, sheetHeight] }) }],
  };

  return (
    <NativeModal visible={modalVisible} transparent animationType="none" statusBarTranslucent onRequestClose={handleClose} testID={testID}>
      <View style={styles.fill}>
        {/* Backdrop */}
        <Pressable
          style={styles.backdropArea}
          onPress={backdropEnabled ? handleClose : undefined}
          accessibilityRole="button"
          accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
          importantForAccessibility="no"
          testID={testID ? `${testID}-backdrop` : undefined}
        >
          <Animated.View style={{ ...styles.backdrop, opacity: backdropOpacity }} />
        </Pressable>

        <SheetKeyboardFrame testID={testID ? `${testID}-keyboard-frame` : undefined}>
          {/* Sheet content */}
          <Animated.View style={sheetStyle} accessibilityViewIsModal testID={testID ? `${testID}-content` : undefined}>
            {/* Drag indicator */}
            <VStack className="w-full items-center py-2">
              <Center className="h-1 w-16 rounded-full bg-gray-400" />
            </VStack>

            <ScrollView
              ref={keepFocusedInputVisible.scrollRef}
              onScroll={keepFocusedInputVisible.onScroll}
              scrollEventThrottle={keepFocusedInputVisible.scrollEventThrottle}
              bounces={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
              contentContainerStyle={styles.scrollContent}
              testID={testID ? `${testID}-sheet-scroll` : undefined}
            >
              <VStack className="w-full flex-1" space="md">
                {isLoading ? (
                  <Center className="h-32">
                    <VStack space="sm" className="items-center">
                      <Spinner size="large" />
                      {loadingText ? <Text className="text-sm text-typography-500">{loadingText}</Text> : null}
                    </VStack>
                  </Center>
                ) : (
                  children
                )}
              </VStack>
            </ScrollView>
          </Animated.View>
        </SheetKeyboardFrame>
      </View>
    </NativeModal>
  );
}

/**
 * Holds the sheet at the bottom of the modal window and, while the keyboard is up, on top of it. The sheet is laid out in
 * this column, not absolutely positioned: an absolute `bottom: 0` child ignores its parent's padding, which is how the
 * keyboard used to cover a status note. Taps on the empty space above the sheet fall through to the backdrop.
 * Rendered inside the modal so the safe-area inset is the modal window's.
 */
function SheetKeyboardFrame({ children, testID }: { children: ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  const frameStyle = useMemo(() => ({ ...styles.frame, paddingTop: Math.max(insets.top, BOTTOM_SHEET_TOP_GAP) }), [insets.top]);

  return (
    <BottomAnchoredKeyboardView style={frameStyle} pointerEvents="box-none" testID={testID}>
      {children}
    </BottomAnchoredKeyboardView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdropArea: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  frame: { justifyContent: 'flex-end' },
  // In the frame's column: as tall as its content up to maxHeight, and shorter when the keyboard leaves less room.
  sheet: { flexShrink: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingBottom: 24 },
  scrollContent: { paddingBottom: 8 },
});
