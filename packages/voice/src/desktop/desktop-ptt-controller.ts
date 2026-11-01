/**
 * Keyboard / console push-to-talk for Dispatch on web and Electron. Dispatch's console only had a tap-to-toggle button;
 * this adds the hold-to-talk hotkey (foot pedals and USB PTT buttons usually emulate a key) on top of the same store.
 *
 * Focus rules: typing in an input, textarea, select or contenteditable never keys the radio; losing window focus or
 * hiding the page while the key is held always releases (the key-up would otherwise be lost and leave the mic open).
 */
export interface DesktopPttHotkey {
  /** `KeyboardEvent.code`, layout-independent: 'Space', 'F13', 'KeyT', 'ControlRight'… */
  code: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}

export type DesktopPttMode = 'hold' | 'toggle';

export const DEFAULT_DESKTOP_PTT_HOTKEY: DesktopPttHotkey = { code: 'Space' };

export interface KeyboardEventLike {
  code: string;
  key?: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  target?: unknown;
  preventDefault?: () => void;
}

/** The subset of `window`/`document` the controller listens on (injectable for tests). */
export interface PttEventTarget {
  addEventListener(type: string, listener: (event: never) => void): void;
  removeEventListener(type: string, listener: (event: never) => void): void;
}

export interface DesktopPttControllerOptions {
  hotkey?: DesktopPttHotkey;
  mode?: DesktopPttMode;
  onPress: () => void;
  onRelease: () => void;
  /** Checked on every key down (e.g. a channel is joined). */
  isEnabled?: () => boolean;
  /** Allow the hotkey while an editable element has focus (only sensible for a non-typing key such as F13). */
  allowInEditableFields?: boolean;
}

interface EditableLike {
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
}

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'reset', 'submit']);

export const isEditableTarget = (target: unknown): boolean => {
  if (!target || typeof target !== 'object') return false;
  const element = target as EditableLike;
  if (element.isContentEditable) return true;
  const tag = (element.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUT_TYPES.has((element.type ?? 'text').toLowerCase());
  return false;
};

export const matchesHotkey = (event: KeyboardEventLike, hotkey: DesktopPttHotkey): boolean =>
  event.code === hotkey.code &&
  Boolean(event.ctrlKey) === Boolean(hotkey.ctrlKey) &&
  Boolean(event.altKey) === Boolean(hotkey.altKey) &&
  Boolean(event.shiftKey) === Boolean(hotkey.shiftKey) &&
  Boolean(event.metaKey) === Boolean(hotkey.metaKey);

/** Human-readable label for settings ("Ctrl+Shift+F13"); the key names are not translated (they match the keyboard). */
export const formatHotkey = (hotkey: DesktopPttHotkey): string =>
  [hotkey.ctrlKey ? 'Ctrl' : null, hotkey.altKey ? 'Alt' : null, hotkey.shiftKey ? 'Shift' : null, hotkey.metaKey ? 'Meta' : null, hotkey.code.replace(/^Key/, '').replace(/^Digit/, '')].filter(Boolean).join('+');

export class DesktopPttController {
  private pressed = false;
  private toggled = false;
  private detach: (() => void) | null = null;

  constructor(private options: DesktopPttControllerOptions) {}

  update(options: Partial<DesktopPttControllerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  isPressed(): boolean {
    return this.pressed || this.toggled;
  }

  attach(windowTarget: PttEventTarget, documentTarget?: PttEventTarget & { visibilityState?: string }): () => void {
    this.detachListeners();
    const onKeyDown = (event: KeyboardEventLike): void => this.handleKeyDown(event);
    const onKeyUp = (event: KeyboardEventLike): void => this.handleKeyUp(event);
    const onBlur = (): void => this.forceRelease();
    const onVisibility = (): void => {
      if (documentTarget?.visibilityState === 'hidden') this.forceRelease();
    };
    windowTarget.addEventListener('keydown', onKeyDown);
    windowTarget.addEventListener('keyup', onKeyUp);
    windowTarget.addEventListener('blur', onBlur);
    documentTarget?.addEventListener('visibilitychange', onVisibility);
    this.detach = () => {
      windowTarget.removeEventListener('keydown', onKeyDown);
      windowTarget.removeEventListener('keyup', onKeyUp);
      windowTarget.removeEventListener('blur', onBlur);
      documentTarget?.removeEventListener('visibilitychange', onVisibility);
    };
    return () => this.detachListeners();
  }

  handleKeyDown(event: KeyboardEventLike): void {
    const hotkey = this.options.hotkey ?? DEFAULT_DESKTOP_PTT_HOTKEY;
    if (!matchesHotkey(event, hotkey)) return;
    if (!this.options.allowInEditableFields && isEditableTarget(event.target)) return;
    if (this.options.isEnabled && !this.options.isEnabled()) return;
    // Keep Space from scrolling or clicking the focused button.
    event.preventDefault?.();
    if (event.repeat || this.pressed) return;
    this.pressed = true;
    if ((this.options.mode ?? 'hold') === 'toggle') {
      this.toggled = !this.toggled;
      if (this.toggled) this.options.onPress();
      else this.options.onRelease();
      return;
    }
    this.options.onPress();
  }

  handleKeyUp(event: KeyboardEventLike): void {
    const hotkey = this.options.hotkey ?? DEFAULT_DESKTOP_PTT_HOTKEY;
    // Modifiers may be released first, so key-up matches on the code alone.
    if (event.code !== hotkey.code || !this.pressed) return;
    event.preventDefault?.();
    this.pressed = false;
    if ((this.options.mode ?? 'hold') === 'hold') this.options.onRelease();
  }

  /** Focus left the window or the page was hidden: never leave the microphone open. */
  forceRelease(): void {
    const wasTransmitting = this.pressed || this.toggled;
    this.pressed = false;
    this.toggled = false;
    if (wasTransmitting) this.options.onRelease();
  }

  private detachListeners(): void {
    this.forceRelease();
    this.detach?.();
    this.detach = null;
  }
}
