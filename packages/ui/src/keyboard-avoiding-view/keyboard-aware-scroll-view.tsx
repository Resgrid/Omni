'use client';

import React from 'react';
import { KeyboardAwareScrollView as KeyboardControllerScrollView, type KeyboardAwareScrollViewProps as KeyboardControllerScrollViewProps, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

/** Room left between the keyboard and the bottom of the focused field, so its border and a line of context show. */
export const KEYBOARD_AWARE_BOTTOM_OFFSET = 24;

export type KeyboardAwareScrollViewProps = KeyboardControllerScrollViewProps;

export type { KeyboardAwareScrollViewRef };

/**
 * The vertical ScrollView for a form or a list that holds text fields: a screen, a page sheet, a call's notes. When the
 * keyboard opens or the focus moves, it scrolls the focused field above the keyboard and adds the keyboard's height to
 * the bottom of the scrollable area, so the last field (a note, a reply) can still be scrolled up into view.
 *
 * It measures where the field is on screen, so it works under a header, in a tab and in a page sheet. Inside
 * `CustomBottomSheet` use the sheet's own scrolling instead: the sheet already sits on top of the keyboard and keeps the
 * focused field in view, and this view would add the keyboard's height a second time.
 *
 * `className` is not mapped on this component; pass `style` and `contentContainerStyle`.
 */
export const KeyboardAwareScrollView = React.forwardRef<KeyboardAwareScrollViewRef, KeyboardAwareScrollViewProps>(
  ({ bottomOffset = KEYBOARD_AWARE_BOTTOM_OFFSET, keyboardShouldPersistTaps = 'handled', ...props }, ref) => (
    <KeyboardControllerScrollView ref={ref} bottomOffset={bottomOffset} keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props} />
  )
);

KeyboardAwareScrollView.displayName = 'KeyboardAwareScrollView';
