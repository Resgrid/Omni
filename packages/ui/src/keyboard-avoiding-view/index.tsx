'use client';

// react-native-keyboard-controller's implementation, unlike React Native's, avoids
// the keyboard on Android too and can measure its own screen offset instead of
// relying on a hardcoded one. The app ships adjustResize (app.config.ts) so the OS
// never pans the window underneath it — see the note there.
export { KeyboardAvoidingView } from 'react-native-keyboard-controller';

// Prefer this on screens that run edge-to-edge to the bottom of the display, and at the root of a
// transparent native modal: it skips the screen-position measurement entirely. See the file for why
// that matters on Android.
export { BottomAnchoredKeyboardView, keyboardPaddingBottom } from './bottom-anchored';

// Which of the three to use (docs/subsystems/keyboard.md):
// - a ScrollView of fields on a screen or page sheet → KeyboardAwareScrollView
// - a composer pinned under a list, or a dialog/sheet in a transparent modal → BottomAnchoredKeyboardView
// - the scroll view inside such a lifted sheet → useKeepFocusedInputVisible (CustomBottomSheet already does)
export { FOCUSED_INPUT_MARGIN, focusedInputScrollDelta, useKeepFocusedInputVisible, type VerticalSpan } from './keep-focused-input-visible';
export { KEYBOARD_AWARE_BOTTOM_OFFSET, KeyboardAwareScrollView, type KeyboardAwareScrollViewProps, type KeyboardAwareScrollViewRef } from './keyboard-aware-scroll-view';
