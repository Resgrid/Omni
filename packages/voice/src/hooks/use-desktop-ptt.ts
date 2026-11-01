import { isWeb } from '@resgrid/core';
import { useEffect, useRef, useState } from 'react';

import { getVoiceCapabilities } from '../capabilities';
import { DEFAULT_DESKTOP_PTT_HOTKEY, DesktopPttController, type DesktopPttHotkey, type DesktopPttMode, type PttEventTarget } from '../desktop/desktop-ptt-controller';
import { useLiveKitStore } from '../livekit/livekit-store';

export interface UseDesktopPttOptions {
  /** Default true; the hook is inert unless the variant declares desktop PTT and runs on web/Electron. */
  enabled?: boolean;
  hotkey?: DesktopPttHotkey;
  mode?: DesktopPttMode;
  allowInEditableFields?: boolean;
  /** Event targets (tests); default `window` and `document`. */
  targets?: { window: PttEventTarget; document?: PttEventTarget & { visibilityState?: string } };
}

export interface UseDesktopPttResult {
  isActive: boolean;
  isHotkeyDown: boolean;
  hotkey: DesktopPttHotkey;
}

const defaultTargets = (): UseDesktopPttOptions['targets'] | null => {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return null;
  return { window: window as unknown as PttEventTarget, document: typeof document === 'undefined' ? undefined : (document as unknown as PttEventTarget & { visibilityState?: string }) };
};

/** Hold-to-talk hotkey for the Dispatch console (web/Electron). Releases on key up, window blur and page hide. */
export function useDesktopPtt(options: UseDesktopPttOptions = {}): UseDesktopPttResult {
  const { enabled = true, hotkey = DEFAULT_DESKTOP_PTT_HOTKEY, mode = 'hold', allowInEditableFields = false, targets } = options;
  const [isHotkeyDown, setIsHotkeyDown] = useState(false);
  const isConnected = useLiveKitStore((s) => s.isConnected);
  const isActive = enabled && getVoiceCapabilities().desktopPtt && (targets !== undefined || isWeb());
  const controllerRef = useRef<DesktopPttController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = new DesktopPttController({
      onPress: () => {
        setIsHotkeyDown(true);
        void useLiveKitStore.getState().startTransmitting('desktop');
      },
      onRelease: () => {
        setIsHotkeyDown(false);
        void useLiveKitStore.getState().stopTransmitting('desktop');
      },
      isEnabled: () => useLiveKitStore.getState().isConnected,
    });
  }
  controllerRef.current.update({ hotkey, mode, allowInEditableFields });

  useEffect(() => {
    const controller = controllerRef.current;
    const resolved = targets ?? defaultTargets();
    if (!isActive || !controller || !resolved) return undefined;
    return controller.attach(resolved.window, resolved.document);
  }, [isActive, targets]);

  // Leaving the channel while the key is held releases it.
  useEffect(() => {
    if (!isConnected) controllerRef.current?.forceRelease();
  }, [isConnected]);

  return { isActive, isHotkeyDown, hotkey };
}
