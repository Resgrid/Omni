/** Keyboard shortcuts on the call screens (Dispatch web). Native screens have no hardware-keyboard shortcuts. */
export interface CallShortcutHandlers {
  /** No shortcuts (e.g. the screen is embedded in another one). */
  disabled?: boolean;
  /** Escape. */
  onBack: () => void;
  /** Ctrl/Cmd+E (detail). */
  onEdit?: () => void;
  /** Ctrl/Cmd+Enter or Ctrl/Cmd+S (form). */
  onSubmit?: () => void;
  /** 1–9: the tab at that position (detail). */
  onTab?: (index: number) => void;
}

/** Whether this platform offers the shortcuts (the screen shows their hint only then). */
export const CALL_SHORTCUTS_AVAILABLE = false;

export function useCallShortcuts(_handlers: CallShortcutHandlers): void {
  // Native: nothing to listen to.
}
