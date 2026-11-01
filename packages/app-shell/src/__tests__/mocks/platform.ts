// Boundary mocks for the L3/L4 packages that wrap device services (push, SignalR, GPS, LiveKit) and the data stores.
// The shell only composes them; their own suites test the behaviour. Each export is a jest.fn tests can inspect.
import type { ReactNode } from 'react';
import { create } from 'zustand';

export interface MockParsedNotification {
  eventCode: string;
  title?: string;
  body?: string;
  target: { kind: string; id: string } | null;
}

export const notifications = {
  usePushNotificationModalStore: create<{ isOpen: boolean; notification: MockParsedNotification | null; hideNotificationModal: () => void }>((set) => ({
    isOpen: false,
    notification: null,
    hideNotificationModal: () => set({ isOpen: false, notification: null }),
  })),
  navigateToNotificationTarget: jest.fn(async () => true),
  NotificationsInboxProvider: ({ children }: { children?: ReactNode }) => children ?? null,
  useNovuInboxConfig: jest.fn(() => ({ ready: false, subscriberId: '', applicationIdentifier: '', apiUrl: '', socketUrl: '' })),
  usePushNotifications: jest.fn(() => ({ pushToken: null })),
  useClearBadgeOnForeground: jest.fn(),
  configureNotifications: jest.fn(),
  pushNotificationService: {
    initialize: jest.fn(async () => undefined),
    unregisterAtSignOut: jest.fn(async () => undefined),
    clearLocalState: jest.fn(async () => undefined),
    registerForPushNotifications: jest.fn(async () => null),
  },
};

export const realtime = {
  useRealtimeStore: create<{ outages: Record<string, { since: number; exhausted: boolean } | undefined>; connectAll: () => Promise<void>; disconnectAll: () => Promise<void> }>(() => ({
    outages: {},
    connectAll: jest.fn(async () => undefined),
    disconnectAll: jest.fn(async () => undefined),
  })),
  useRealtimeLifecycle: jest.fn(),
  configureRealtime: jest.fn(),
  teardownRealtime: jest.fn(async () => undefined),
};

export const voice = {
  configureVoice: jest.fn(),
  initializeVoice: jest.fn(async () => undefined),
  registerVoiceResets: jest.fn(() => () => undefined),
};

export const location = {
  configureLocation: jest.fn(),
  registerBackgroundLocationBootstrap: jest.fn(),
};

export const data = {
  configureData: jest.fn(async () => () => undefined),
  refreshDataWorkingSet: jest.fn(async () => undefined),
  defaultIdGenerator: jest.fn(() => 'device-uuid-1'),
};
