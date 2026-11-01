/**
 * Foreground push modal state (Responder's push modal behaviour; the UI arrives with the shell). A push that arrives
 * while the app is open — or a tapped one whose deep link cannot land — is surfaced here so it stays visible instead
 * of the app opening to nothing.
 */
import { logger } from '@resgrid/core';
import { create } from 'zustand';

import { getOptionalNotificationsDependencies } from './configure';
import { type ParsedEventCode, parseEventCode } from './event-codes';
import { notificationSoundService } from './notification-sound';

export interface PushNotificationData {
  eventCode: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}

export interface ParsedNotification extends ParsedEventCode {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  /** Epoch ms the modal was shown. */
  receivedAt: number;
}

export interface ShowNotificationOptions {
  /** Play the in-app sound first (web/desktop, where the OS played nothing). Native foreground pushes leave it off. */
  playSound?: boolean;
}

export interface PushNotificationModalState {
  isOpen: boolean;
  notification: ParsedNotification | null;
  showNotificationModal: (notification: PushNotificationData, options?: ShowNotificationOptions) => Promise<void>;
  hideNotificationModal: () => void;
}

/** Parses a push into what the modal shows; the target is null for unknown codes and unsafe ids. */
export const parseNotificationData = (notification: PushNotificationData): ParsedNotification => {
  const isChatbotChannel = getOptionalNotificationsDependencies()?.isChatbotChannel;
  return {
    ...parseEventCode(notification.eventCode, isChatbotChannel ? { isChatbotChannel } : {}),
    ...(notification.title ? { title: notification.title } : {}),
    ...(notification.body ? { body: notification.body } : {}),
    ...(notification.data ? { data: notification.data } : {}),
    receivedAt: Date.now(),
  };
};

export const usePushNotificationModalStore = create<PushNotificationModalState>((set) => ({
  isOpen: false,
  notification: null,

  showNotificationModal: async (notification, options = {}) => {
    if (!notification?.eventCode || typeof notification.eventCode !== 'string') {
      return;
    }
    const parsed = parseNotificationData(notification);

    logger.info({ message: 'Showing push notification modal', context: { kind: parsed.kind, eventCode: parsed.eventCode } });

    if (options.playSound) {
      // Started before the modal appears, as Unit did; a sound failure never blocks the modal.
      await notificationSoundService.playForNotification({ kind: parsed.kind, closed: parsed.target?.closed === true, soundType: parsed.data?.type });
    }

    set({ isOpen: true, notification: parsed });
  },

  hideNotificationModal: () => {
    set({ isOpen: false, notification: null });
  },
}));
