/** Web and Electron schedule no local notifications yet (same exported surface as local-notifications.ts). */
import type { LocalNotificationKind, LocalNotificationSet } from './local-notification-data';

export type ExactAlarmAccess = 'granted' | 'denied' | 'notNeeded';

export interface ExactAlarmAccessView {
  access: ExactAlarmAccess | null;
  request: () => Promise<void>;
}

export const syncLocalNotifications = (_kind: LocalNotificationKind, _set: LocalNotificationSet | null): Promise<void> => Promise.resolve();

export const cancelAllLocalNotifications = (): Promise<void> => Promise.resolve();

export const getExactAlarmAccess = (): Promise<ExactAlarmAccess> => Promise.resolve('notNeeded');

export const requestExactAlarmAccess = (): Promise<ExactAlarmAccess> => Promise.resolve('notNeeded');

const NOT_NEEDED: ExactAlarmAccessView = { access: 'notNeeded', request: () => Promise.resolve() };

export const useExactAlarmAccess = (_enabled: boolean = true): ExactAlarmAccessView => NOT_NEEDED;
