import React from 'react';
// eslint-disable-next-line no-restricted-imports -- this is the one sanctioned wrapper around React Native's Modal.
import { Modal, type ModalProps, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalToastHost } from '../toast/toast-container';

/** iOS defaults a Modal to portrait-only, which rotates a landscape iPad/board back to portrait. */
export const ALL_ORIENTATIONS: NonNullable<ModalProps['supportedOrientations']> = ['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right'];

export type NativeModalProps = ModalProps;

/**
 * React Native's Modal with a toast host inside it. Use it instead of importing Modal from
 * 'react-native' directly (ESLint enforces this).
 *
 * A native Modal is its own window above the app, so toasts drawn in the app window — every error
 * or confirmation shown while the modal is open — sit underneath it where nobody sees them.
 * All orientations are allowed unless the caller narrows them.
 *
 * The modal gets its own SafeAreaProvider, so safe-area insets inside it describe the modal's window
 * rather than the app's: none at the top of an iOS page sheet, the status bar and cutout on Android
 * (where every modal is drawn edge to edge).
 */
export const NativeModal: React.FC<NativeModalProps> = ({ children, supportedOrientations = ALL_ORIENTATIONS, ...props }) => (
  <Modal supportedOrientations={supportedOrientations} {...props}>
    <SafeAreaProvider>
      {children}
      <ModalToastHost />
    </SafeAreaProvider>
  </Modal>
);

export interface NativeModalScreenProps extends ViewProps {
  className?: string;
}

/**
 * Root view of an opaque (page-sheet or full-screen) NativeModal. It fills the modal and pads its
 * content clear of the status bar, camera cutout and home indicator, so a sheet's header and close
 * button are never drawn — or tapped — under the system bars. Give it the sheet's background.
 */
export const NativeModalScreen: React.FC<NativeModalScreenProps> = ({ children, style, ...props }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={StyleSheet.flatten([styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }, style])} {...props}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
