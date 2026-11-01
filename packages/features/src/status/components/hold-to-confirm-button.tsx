import { Text } from '@resgrid/ui';
import { Check, Fingerprint } from 'lucide-react-native';
import React from 'react';
import { type LayoutChangeEvent, Pressable, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

/** How long a status button has to be held (department setting "Hold to set status", config `StatusHoldToConfirm`). */
export const STATUS_HOLD_DURATION_MS = 2000;
/** A release sooner than this is a tap, which gets the "press and hold" hint instead of silence. */
export const HOLD_TAP_THRESHOLD_MS = 350;
const DONE_RESET_MS = 900;

type HoldPhase = 'idle' | 'holding' | 'done';

export interface HoldToConfirmButtonProps {
  onConfirm: () => void;
  /** A tap instead of a hold (show the "press and hold" hint). */
  onTap?: () => void;
  durationMs?: number;
  disabled?: boolean;
  backgroundColor: string;
  foregroundColor: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  showHoldGlyph?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const tint = (foregroundColor: string, alpha: number): string => {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(foregroundColor.trim());
  if (!match) return `rgba(255,255,255,${alpha})`;
  const hex = match[1].length === 3 ? match[1].replace(/(.)/g, '$1$1') : match[1];
  return `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${alpha})`;
};

/**
 * Press-and-hold button (Unit/Responder baseline): a fill sweeps across while held, the hold confirms after
 * `durationMs`, a short tap calls `onTap`. Screen readers activate it directly (the hold is a motor-safety
 * affordance, not a security check).
 */
export const HoldToConfirmButton: React.FC<HoldToConfirmButtonProps> = ({
  onConfirm,
  onTap,
  durationMs = STATUS_HOLD_DURATION_MS,
  disabled = false,
  backgroundColor,
  foregroundColor,
  style,
  children,
  showHoldGlyph = true,
  testID,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const [phase, setPhase] = React.useState<HoldPhase>('idle');
  const progress = useSharedValue(0);
  const check = useSharedValue(0);
  const width = useSharedValue(0);

  const phaseRef = React.useRef<HoldPhase>('idle');
  const startedAtRef = React.useRef(0);
  const confirmTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [remainingMs, setRemainingMs] = React.useState(durationMs);
  const onConfirmRef = React.useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const setBoth = React.useCallback((next: HoldPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearConfirmTimer = React.useCallback(() => {
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  React.useEffect(
    () => () => {
      clearConfirmTimer();
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [clearConfirmTimer]
  );

  const settle = React.useCallback(() => {
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: 200 });
    check.value = withTiming(0, { duration: 150 });
  }, [check, progress]);

  const complete = React.useCallback(() => {
    clearConfirmTimer();
    setBoth('done');
    progress.value = 1;
    check.value = withSpring(1, { damping: 9, stiffness: 240 });
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = null;
      setBoth('idle');
      settle();
    }, DONE_RESET_MS);
    onConfirmRef.current();
  }, [check, clearConfirmTimer, progress, setBoth, settle]);

  const handlePressIn = React.useCallback(() => {
    if (disabled || phaseRef.current !== 'idle') return;
    startedAtRef.current = Date.now();
    setBoth('holding');
    progress.value = 0;
    progress.value = withTiming(1, { duration: durationMs, easing: Easing.linear });
    setRemainingMs(durationMs);
    confirmTimerRef.current = setTimeout(complete, durationMs);
    // The countdown the holder reads ("1.4s"): ticked here because nothing else re-renders during the hold.
    tickTimerRef.current = setInterval(() => setRemainingMs(Math.max(0, durationMs - (Date.now() - startedAtRef.current))), 100);
  }, [complete, disabled, durationMs, progress, setBoth]);

  const handlePressOut = React.useCallback(() => {
    if (phaseRef.current !== 'holding') return;
    const heldFor = Date.now() - startedAtRef.current;
    clearConfirmTimer();
    setBoth('idle');
    settle();
    if (heldFor < HOLD_TAP_THRESHOLD_MS) onTap?.();
  }, [clearConfirmTimer, onTap, setBoth, settle]);

  const handleAccessibilityAction = React.useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === 'activate' && !disabled && phaseRef.current === 'idle') complete();
    },
    [complete, disabled]
  );

  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      width.value = event.nativeEvent.layout.width;
    },
    [width]
  );

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (progress.value - 1) * width.value }] }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: check.value }));

  return (
    <View style={StyleSheet.flatten([styles.wrapper, disabled ? styles.disabled : null, style])}>
      <Pressable
        testID={testID}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLayout={handleLayout}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled, busy: phase === 'holding' }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={handleAccessibilityAction}
        style={StyleSheet.flatten([styles.button, { backgroundColor }])}
      >
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint(foregroundColor, 0.28) }, fillStyle]} />
        <View style={styles.content}>
          <View style={styles.label}>{children}</View>
          {phase === 'done' ? (
            <Animated.View style={checkStyle}>
              <Check size={20} color={foregroundColor} />
            </Animated.View>
          ) : showHoldGlyph ? (
            <View style={styles.glyph}>
              {phase === 'holding' ? (
                <Text style={{ color: foregroundColor }} className="text-xs font-semibold">
                  {`${(remainingMs / 1000).toFixed(1)}s`}
                </Text>
              ) : (
                <Fingerprint size={20} color={foregroundColor} />
              )}
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { borderRadius: 8 },
  disabled: { opacity: 0.5 },
  button: { borderRadius: 8, overflow: 'hidden', minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  content: { flexDirection: 'row', alignItems: 'center' },
  label: { flex: 1 },
  glyph: { marginLeft: 8, minWidth: 28, alignItems: 'flex-end' },
});
