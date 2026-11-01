import { useTranslation } from '@resgrid/i18n';
import { View } from '@resgrid/ui';
import { MoveDiagonal2 } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { DashboardWidget } from '../hooks/use-dashboard-store';
import { dragSize, dropCell, type GridConfig, gridPixelHeight, type GridRect, rectToFrame, WIDGET_GAP } from '../lib/grid';
import { WidgetRenderer } from './widget-renderer';

/** Snap back / settle after a drag (expo-animation: finger involved → spring; reduced motion respected). */
const SNAP_SPRING = { duration: 400, dampingRatio: 0.8, reduceMotion: ReduceMotion.System } as const;
const RESIZE_HANDLE_SIZE = 28;

export interface DashboardGridProps {
  widgets: readonly DashboardWidget[];
  layout: ReadonlyMap<string, GridRect>;
  config: GridConfig;
  isEditMode: boolean;
  /** Returns true when the widget moved (false: the cell was taken and it snaps back). */
  onMove: (id: string, cell: { x: number; y: number }) => boolean;
  onResize: (id: string, size: { w: number; h: number }) => boolean;
  onRemove: (id: string) => void;
  onConfigure: (widget: DashboardWidget) => void;
  /** A drag started/ended (the screen stops scrolling while a widget is held). */
  onDragStateChange?: (dragging: boolean) => void;
}

interface DraggableWidgetProps extends Omit<DashboardGridProps, 'widgets' | 'layout'> {
  widget: DashboardWidget;
  rect: GridRect;
}

const DraggableWidget: React.FC<DraggableWidgetProps> = ({ widget, rect, config, isEditMode, onMove, onResize, onRemove, onConfigure, onDragStateChange }) => {
  const { t } = useTranslation();
  const frame = rectToFrame(rect, config);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const lifted = useSharedValue(0);
  const resizeX = useSharedValue(0);
  const resizeY = useSharedValue(0);
  const resizing = useSharedValue(0);

  const setDragging = useCallback((dragging: boolean) => onDragStateChange?.(dragging), [onDragStateChange]);

  /** On the JS side after a drop: commit the cell, then settle from where the finger let go into the (new) cell. */
  const handleDrop = useCallback(
    (dx: number, dy: number, success: boolean) => {
      const target = dropCell(rect, dx, dy, config);
      const moved = success && onMove(widget.id, target);
      // The widget re-renders at its new cell: offset by the distance it moved so it settles from the drop point.
      translateX.set(moved ? dx - (target.x - rect.x) * config.cellWidth : dx);
      translateY.set(moved ? dy - (target.y - rect.y) * config.cellHeight : dy);
      translateX.set(withSpring(0, SNAP_SPRING));
      translateY.set(withSpring(0, SNAP_SPRING));
      lifted.set(0);
      setDragging(false);
    },
    [config, lifted, onMove, rect, setDragging, translateX, translateY, widget.id]
  );

  const handleResize = useCallback(
    (dx: number, dy: number, success: boolean) => {
      if (success) onResize(widget.id, dragSize(rect, dx, dy, config));
      resizeX.set(0);
      resizeY.set(0);
      resizing.set(0);
      setDragging(false);
    },
    [config, onResize, rect, resizeX, resizeY, resizing, setDragging, widget.id]
  );

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isEditMode)
        .onStart(() => {
          resizing.set(1);
          scheduleOnRN(setDragging, true);
        })
        .onUpdate((event) => {
          resizeX.set(event.translationX);
          resizeY.set(event.translationY);
        })
        .onEnd((event, success) => {
          scheduleOnRN(handleResize, event.translationX, event.translationY, success);
        }),
    [handleResize, isEditMode, resizeX, resizeY, resizing, setDragging]
  );

  const moveGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isEditMode)
        .minDistance(4)
        .requireExternalGestureToFail(resizeGesture)
        .onStart(() => {
          lifted.set(1);
          scheduleOnRN(setDragging, true);
        })
        .onUpdate((event) => {
          translateX.set(event.translationX);
          translateY.set(event.translationY);
        })
        .onEnd((event, success) => {
          scheduleOnRN(handleDrop, event.translationX, event.translationY, success);
        }),
    [handleDrop, isEditMode, lifted, resizeGesture, setDragging, translateX, translateY]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }, { translateY: translateY.get() }],
    zIndex: lifted.get() === 1 || resizing.get() === 1 ? 1000 : 1,
    opacity: lifted.get() === 1 ? 0.85 : 1,
  }));

  // The resize preview is an absolutely positioned, childless outline, so animating its size costs no layout of siblings.
  const previewStyle = useAnimatedStyle(() => ({
    opacity: resizing.get(),
    width: Math.max(config.cellWidth, frame.width + resizeX.get()) - WIDGET_GAP,
    height: Math.max(config.cellHeight, frame.height + resizeY.get()) - WIDGET_GAP,
  }));

  // Static styles are flattened (web/Electron); the animated style stays a separate entry, as Reanimated requires.
  const frameStyle = StyleSheet.flatten([styles.widget, { left: frame.left, top: frame.top, width: frame.width, height: frame.height }]);

  return (
    <Animated.View style={[frameStyle, animatedStyle]} testID={`dashboard-widget-${widget.type}`}>
      <GestureDetector gesture={moveGesture}>
        <View style={styles.fill}>
          <WidgetRenderer type={widget.type} isEditMode={isEditMode} width={frame.width - WIDGET_GAP} height={frame.height - WIDGET_GAP} onRemove={() => onRemove(widget.id)} onConfigure={() => onConfigure(widget)} />
        </View>
      </GestureDetector>
      {isEditMode ? (
        <>
          <Animated.View pointerEvents="none" style={[styles.resizePreview, previewStyle]} />
          <GestureDetector gesture={resizeGesture}>
            <View style={styles.resizeHandle} accessibilityLabel={t('dashboard.resize_widget')} testID={`dashboard-widget-${widget.type}-resize-handle`}>
              <MoveDiagonal2 size={16} color="#6b7280" />
            </View>
          </GestureDetector>
        </>
      ) : null}
    </Animated.View>
  );
};

/**
 * The board: every widget absolutely placed in its resolved cell. In edit mode a widget is dragged to a free cell
 * (Gesture Handler pan, Reanimated transform on the UI thread; a drop on a taken cell springs back) and resized from its
 * corner handle. Keyboard and screen-reader users reorder and resize on the Configure screen.
 */
export const DashboardGrid: React.FC<DashboardGridProps> = ({ widgets, layout, config, ...rest }) => {
  const height = gridPixelHeight(layout, config);
  return (
    <View style={StyleSheet.flatten([styles.grid, { height }])} testID="dashboard-grid">
      {widgets.map((widget) => {
        const rect = layout.get(widget.id);
        return rect ? <DraggableWidget key={widget.id} widget={widget} rect={rect} config={config} {...rest} /> : null;
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: { position: 'relative', width: '100%' },
  widget: { position: 'absolute', padding: WIDGET_GAP / 2 },
  fill: { flex: 1 },
  resizePreview: { position: 'absolute', left: WIDGET_GAP / 2, top: WIDGET_GAP / 2, borderWidth: 2, borderStyle: 'dashed', borderColor: '#2563eb', borderRadius: 8 },
  resizeHandle: {
    position: 'absolute',
    right: WIDGET_GAP / 2,
    bottom: WIDGET_GAP / 2,
    width: RESIZE_HANDLE_SIZE,
    height: RESIZE_HANDLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 8,
    backgroundColor: 'rgba(107,114,128,0.18)',
  },
});
