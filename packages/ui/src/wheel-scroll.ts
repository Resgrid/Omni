import type React from 'react';
import type { ScrollView } from 'react-native';

/**
 * Native: no mouse wheel to listen to; a finger swipes a sideways row. Web and Electron let an up/down wheel scroll the
 * row (`wheel-scroll.web.ts`).
 */
export function useWheelScrollsSideways(_scrollViewRef: React.RefObject<React.ComponentRef<typeof ScrollView> | null>, _enabled: boolean): void {
  // Nothing to attach on native.
}
