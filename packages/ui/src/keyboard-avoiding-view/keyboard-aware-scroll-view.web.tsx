'use client';

import { mergeRefs } from '@gluestack-ui/utils/common';
import React, { useCallback } from 'react';
import type { KeyboardAwareScrollViewProps as KeyboardControllerScrollViewProps, KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

import { ScrollView } from '../scroll-view';

/** Room left between the keyboard and the bottom of the focused field, so its border and a line of context show. */
export const KEYBOARD_AWARE_BOTTOM_OFFSET = 24;

export type KeyboardAwareScrollViewProps = KeyboardControllerScrollViewProps;

export type { KeyboardAwareScrollViewRef };

const noop = (): void => undefined;

/**
 * Web and Electron: a plain ScrollView. The browser scrolls a focused field into view itself (and a phone browser
 * shrinks the visual viewport for its keyboard), so there is no keyboard to measure here. The native-only props are
 * dropped rather than handed to the DOM.
 */
export const KeyboardAwareScrollView = React.forwardRef<KeyboardAwareScrollViewRef, KeyboardAwareScrollViewProps>(
  (
    {
      bottomOffset: _bottomOffset,
      disableScrollOnKeyboardHide: _disableScrollOnKeyboardHide,
      enabled: _enabled,
      extraKeyboardSpace: _extraKeyboardSpace,
      mode: _mode,
      ScrollViewComponent: _ScrollViewComponent,
      keyboardShouldPersistTaps = 'handled',
      ...props
    },
    ref
  ) => {
    // The same handle the native view hands out, with nothing to do for `assureFocusedInputVisible`.
    const setRef = useCallback((instance: React.ComponentRef<typeof ScrollView> | null) => mergeRefs([ref])(instance === null ? null : Object.assign(instance, { assureFocusedInputVisible: noop })), [ref]);

    return <ScrollView ref={setRef} keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props} />;
  }
);

KeyboardAwareScrollView.displayName = 'KeyboardAwareScrollView';
