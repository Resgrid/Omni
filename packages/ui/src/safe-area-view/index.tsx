'use client';
import { createContext, useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export { SafeAreaView } from 'react-native-safe-area-context';

/**
 * True for screens drawn above a bottom tab bar: the tab bar already keeps itself clear of the home indicator and the
 * Android navigation bar, so a control pinned to the bottom of such a screen must not add that inset again. The app
 * shell provides it around its tab navigators (Unit, IC, Responder's home tabs); a native modal resets it, as its window
 * reaches the bottom of the display. Default: not consumed (a screen in a stack reaches the bottom edge).
 */
export const BottomInsetConsumedContext = createContext(false);

/**
 * The bottom safe-area inset a control pinned to the bottom of the current screen (a FAB, a composer, an alert) has to
 * keep clear of: the device's inset, or 0 above a bottom tab bar that already pads it.
 */
export function useBottomSafeAreaInset(): number {
  const insets = useSafeAreaInsets();
  const consumed = useContext(BottomInsetConsumedContext);

  return consumed ? 0 : insets.bottom;
}

/**
 * `safeAreaInsets` for a bottom tab navigator inside the app shell (its tabs, Responder's home tabs): the shell's content
 * already pads the left and right insets of a landscape phone, so the tab bar pads only the bottom one (from the device).
 */
export const TAB_BAR_SAFE_AREA_INSETS = { left: 0, right: 0 } as const;
