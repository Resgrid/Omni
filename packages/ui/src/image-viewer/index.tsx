import type { ImageProps } from 'expo-image';
import { X } from 'lucide-react-native';
import React, { useEffect, useMemo } from 'react';
import { Animated, type GestureResponderEvent, type LayoutChangeEvent, PanResponder, type PanResponderGestureState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Image } from '../image';
import { NativeModal } from '../native-modal';
import { Pressable } from '../pressable';
import { Text } from '../text';
import { useTranslation } from '../utils/i18n';
import { clampOffset, clampZoom, DOUBLE_TAP_MS, DOUBLE_TAP_ZOOM, MIN_ZOOM, TAP_SLOP, touchDistance } from './zoom';

export interface ImageViewerProps {
  /** The picture to show full screen; null keeps the viewer closed. */
  source: NonNullable<ImageProps['source']> | null;
  /** Shown while `source` downloads (for example the cached thumbnail). */
  placeholder?: ImageProps['placeholder'];
  /** Text along the bottom: the picture's name or the message it came with. */
  caption?: string;
  /** What a screen reader says for the picture. */
  label: string;
  onClose: () => void;
  /** The modal's testID; the picture, caption and close button add `-image`, `-caption` and `-close`. */
  testID?: string;
}

interface ZoomState {
  scale: number;
  x: number;
  y: number;
  width: number;
  height: number;
  startScale: number;
  startX: number;
  startY: number;
  startDistance: number;
  panOriginX: number;
  panOriginY: number;
  pinched: boolean;
  lastTap: number;
}

const ZOOM_ANIMATION_MS = 180;

/**
 * Pinch to zoom, drag to pan a zoomed picture, double tap to zoom in on a point and back out. Built on the core
 * responder system, so it needs no gesture-handler root inside the modal and works the same on iOS, Android and web.
 */
const usePinchZoom = () =>
  useMemo(() => {
    const values = { scale: new Animated.Value(MIN_ZOOM), x: new Animated.Value(0), y: new Animated.Value(0) };
    const zoom: ZoomState = { scale: MIN_ZOOM, x: 0, y: 0, width: 0, height: 0, startScale: MIN_ZOOM, startX: 0, startY: 0, startDistance: 0, panOriginX: 0, panOriginY: 0, pinched: false, lastTap: 0 };

    const show = (scale: number, x: number, y: number, animate: boolean) => {
      zoom.scale = scale;
      zoom.x = x;
      zoom.y = y;

      if (!animate) {
        values.scale.setValue(scale);
        values.x.setValue(x);
        values.y.setValue(y);

        return;
      }

      Animated.parallel([
        Animated.timing(values.scale, { toValue: scale, duration: ZOOM_ANIMATION_MS, useNativeDriver: false }),
        Animated.timing(values.x, { toValue: x, duration: ZOOM_ANIMATION_MS, useNativeDriver: false }),
        Animated.timing(values.y, { toValue: y, duration: ZOOM_ANIMATION_MS, useNativeDriver: false }),
      ]).start();
    };

    const begin = (event: GestureResponderEvent) => {
      zoom.startScale = zoom.scale;
      zoom.startX = zoom.x;
      zoom.startY = zoom.y;
      zoom.startDistance = touchDistance(event.nativeEvent.touches);
      zoom.panOriginX = 0;
      zoom.panOriginY = 0;
      zoom.pinched = zoom.startDistance > 0;
    };

    const move = (event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      const distance = touchDistance(event.nativeEvent.touches);

      if (distance > 0) {
        // A second finger can land after the first: the pinch starts from wherever the picture is then.
        if (zoom.startDistance === 0) {
          zoom.startDistance = distance;
          zoom.startScale = zoom.scale;
        }

        zoom.pinched = true;
        const scale = clampZoom((zoom.startScale * distance) / zoom.startDistance);

        show(scale, clampOffset(zoom.x, zoom.width, scale), clampOffset(zoom.y, zoom.height, scale), false);

        return;
      }

      if (zoom.startDistance > 0) {
        // The second finger lifted: carry on as a drag from where the pinch left the picture.
        zoom.startDistance = 0;
        zoom.startX = zoom.x;
        zoom.startY = zoom.y;
        zoom.panOriginX = gesture.dx;
        zoom.panOriginY = gesture.dy;
      }

      if (zoom.scale > MIN_ZOOM) {
        show(zoom.scale, clampOffset(zoom.startX + gesture.dx - zoom.panOriginX, zoom.width, zoom.scale), clampOffset(zoom.startY + gesture.dy - zoom.panOriginY, zoom.height, zoom.scale), false);
      }
    };

    const end = (event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      if (zoom.pinched || Math.abs(gesture.dx) >= TAP_SLOP || Math.abs(gesture.dy) >= TAP_SLOP) return;

      const now = Date.now();

      if (now - zoom.lastTap > DOUBLE_TAP_MS) {
        zoom.lastTap = now;

        return;
      }

      zoom.lastTap = 0;

      if (zoom.scale > MIN_ZOOM) {
        show(MIN_ZOOM, 0, 0, true);

        return;
      }

      // Zoom in around the tapped point, so it stays under the finger.
      const { locationX, locationY } = event.nativeEvent;
      const shift = 1 - DOUBLE_TAP_ZOOM;

      show(DOUBLE_TAP_ZOOM, clampOffset((locationX - zoom.width / 2) * shift, zoom.width, DOUBLE_TAP_ZOOM), clampOffset((locationY - zoom.height / 2) * shift, zoom.height, DOUBLE_TAP_ZOOM), true);
    };

    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: begin,
      onPanResponderMove: move,
      onPanResponderRelease: end,
    });

    return {
      panHandlers: responder.panHandlers,
      style: { transform: [{ translateX: values.x }, { translateY: values.y }, { scale: values.scale }] },
      onLayout: (event: LayoutChangeEvent) => {
        zoom.width = event.nativeEvent.layout.width;
        zoom.height = event.nativeEvent.layout.height;
      },
      reset: () => {
        zoom.lastTap = 0;
        show(MIN_ZOOM, 0, 0, false);
      },
    };
  }, []);

type PinchZoom = ReturnType<typeof usePinchZoom>;

type ViewerContentProps = Omit<ImageViewerProps, 'testID'> & { testID: string; zoom: PinchZoom };

/**
 * The viewer's window. It is rendered inside NativeModal so the safe-area insets are the viewer's own full-screen
 * window: read outside it they were the opener's, and over a page sheet (no top inset) the close button sat under the
 * status bar and the notch.
 */
const ViewerContent: React.FC<ViewerContentProps> = ({ source, placeholder, caption, label, onClose, testID, zoom }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.viewer}>
      <Animated.View style={StyleSheet.flatten([styles.frame, zoom.style])} onLayout={zoom.onLayout} {...zoom.panHandlers} testID={`${testID}-frame`}>
        {/* The frame takes every touch (and the web's native image drag never starts). */}
        <View style={styles.passThrough}>
          {source ? <Image source={source} placeholder={placeholder} placeholderContentFit="contain" contentFit="contain" style={styles.frame} accessibilityLabel={label} testID={`${testID}-image`} /> : null}
        </View>
      </Animated.View>
      {caption ? (
        <View style={StyleSheet.flatten([styles.caption, { paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }])} testID={`${testID}-caption`}>
          <Text className="text-base text-white">{caption}</Text>
        </View>
      ) : null}
      <View style={StyleSheet.flatten([styles.close, { top: insets.top + 8, right: insets.right + 16 }])}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
          hitSlop={8}
          className="size-10 items-center justify-center rounded-full bg-black/50"
          testID={`${testID}-close`}
        >
          <X size={22} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
};

/**
 * A picture full screen on black, with a close button and an optional caption: pinch or double tap to zoom, drag to
 * look around a zoomed picture. The one viewer for every image a screen shows small (call images, chat images,
 * work-order photos, checklist evidence). Opened over a page sheet it covers the whole screen, not just the sheet.
 */
export const ImageViewer: React.FC<ImageViewerProps> = ({ source, placeholder = null, caption, label, onClose, testID = 'image-viewer' }) => {
  const zoom = usePinchZoom();
  const isOpen = source !== null;

  // Every picture opens fitted to the screen, whatever zoom the last one was left at.
  useEffect(() => {
    if (!isOpen) zoom.reset();
  }, [isOpen, zoom]);

  return (
    <NativeModal visible={isOpen} animationType="fade" onRequestClose={onClose} testID={testID}>
      <ViewerContent source={source} placeholder={placeholder} caption={caption} label={label} onClose={onClose} testID={testID} zoom={zoom} />
    </NativeModal>
  );
};

const styles = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: '#000000', overflow: 'hidden' },
  frame: { flex: 1 },
  passThrough: { flex: 1, pointerEvents: 'none' },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, backgroundColor: 'rgba(0,0,0,0.5)', pointerEvents: 'none' },
  close: { position: 'absolute' },
});
