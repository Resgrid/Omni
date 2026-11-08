import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';

import type { CallShortcutHandlers } from './use-call-shortcuts';

export type { CallShortcutHandlers } from './use-call-shortcuts';

/** Web and Electron offer the shortcuts (Dispatch web). */
export const CALL_SHORTCUTS_AVAILABLE = true;

const isTyping = (target: EventTarget | null): boolean => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** On web every pop-up (NativeModal, CustomBottomSheet, dialogs) renders an `aria-modal` dialog while it is open. */
const isPopupOpen = (): boolean => document.querySelector('[aria-modal="true"]') !== null;

/**
 * Dispatch web's call shortcuts: Escape goes back, Ctrl/Cmd+E edits (detail), Ctrl/Cmd+Enter or Ctrl/Cmd+S saves (form),
 * 1–9 switch to the tab at that position (detail). Digits never fire while the dispatcher is typing in a field. Only the
 * focused screen listens: the stack keeps the call detail mounted under the edit form it opened. None fire while a
 * pop-up is open over the screen, wherever it was opened from (Unit's sidebar, Set Active, the screen's own sheets):
 * the pop-up owns the keyboard, and React Native Web's Modal closes on the Escape keyup, after this keydown.
 */
export function useCallShortcuts(handlers: CallShortcutHandlers): void {
  const isFocused = useIsFocused();
  const isDisabled = handlers.disabled === true;
  const latest = useRef(handlers);

  latest.current = handlers;

  useEffect(() => {
    if (!isFocused || isDisabled) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      const { onBack, onEdit, onSubmit, onTab } = latest.current;
      const withModifier = event.ctrlKey || event.metaKey;

      if (isPopupOpen()) {
        // Nothing submits under a pop-up, but a form's Ctrl/Cmd+S still never opens the browser's Save Page dialog.
        if (onSubmit && withModifier && (event.key === 's' || event.key === 'S')) event.preventDefault();

        return;
      }

      // Escape cancels from any field (the form's "Escape to cancel" tip), but not a key an open popup already handled.
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return;
        event.preventDefault();
        onBack();

        return;
      }

      if (withModifier && (event.key === 'e' || event.key === 'E') && onEdit) {
        event.preventDefault();
        onEdit();

        return;
      }

      if (withModifier && (event.key === 'Enter' || event.key === 's' || event.key === 'S') && onSubmit) {
        event.preventDefault();
        onSubmit();

        return;
      }

      if (onTab && !withModifier && !event.altKey && event.key >= '1' && event.key <= '9' && !isTyping(event.target)) onTab(Number(event.key) - 1);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDisabled, isFocused]);
}
