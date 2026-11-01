import React from 'react';
// eslint-disable-next-line no-restricted-imports -- this is the one sanctioned wrapper around React Native's Modal.
import { Modal, type ModalProps } from 'react-native';

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
 */
export const NativeModal: React.FC<NativeModalProps> = ({ children, supportedOrientations = ALL_ORIENTATIONS, ...props }) => (
  <Modal supportedOrientations={supportedOrientations} {...props}>
    {children}
    <ModalToastHost />
  </Modal>
);
