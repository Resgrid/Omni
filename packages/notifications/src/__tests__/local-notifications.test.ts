// Notifications the app schedules on the device (the unit's status timer): a sync schedules what is wanted, reschedules
// what changed, leaves unchanged ones alone, cancels the rest, skips times already past and removes delivered ones from
// an episode that ended. Calls run one at a time and never reject.
import { STATUS_TIMER_CATEGORY_ID, STATUS_TIMER_CHANNEL } from '../channels';
import { type LocalNotificationSet, readLocalNotificationData } from '../local-notification-data';
import { cancelAllLocalNotifications, getExactAlarmAccess, requestExactAlarmAccess, syncLocalNotifications } from '../local-notifications';
import { logger } from './mocks/core';
import * as notifications from './mocks/expo-notifications';
import { mockFireScheduled, mockNotificationState, mockResetNotifications } from './mocks/expo-notifications';

const T0 = Date.parse('2026-11-03T12:00:00Z');

const WARN_AT = T0 + 90_000;

const ALERT_AT = T0 + 270_000;

const timerSet = (overrides: Partial<LocalNotificationSet> = {}): LocalNotificationSet => ({
  scope: '12',
  episode: '12:501:1',
  notifications: [
    { key: 'warn', at: WARN_AT, title: 'Status timer warning: Responding for 2m', body: 'Engine 1: update your status if it has changed.' },
    { key: 'alert', at: ALERT_AT, title: 'Status timer exceeded: Responding for 5m', body: 'Engine 1: update your status if it has changed.' },
  ],
  ...overrides,
});

const scheduledIds = (): string[] => [...mockNotificationState.scheduled.keys()].sort();

const rn = jest.requireMock<{ Platform: { OS: string } }>('react-native');

beforeEach(() => {
  rn.Platform.OS = 'ios';
  jest.useFakeTimers({ now: T0, doNotFake: ['setImmediate', 'nextTick'] });
  mockResetNotifications();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('syncLocalNotifications', () => {
  it('schedules each notification at its time on the status timer channel and category, with the modern sound', async () => {
    await syncLocalNotifications('statusTimer', timerSet());
    expect(scheduledIds()).toEqual(['statusTimer:12:alert', 'statusTimer:12:warn']);
    const warn = mockNotificationState.scheduled.get('statusTimer:12:warn');
    expect(warn?.trigger).toEqual({ type: 'date', date: WARN_AT, channelId: STATUS_TIMER_CHANNEL.id });
    expect(warn?.content).toMatchObject({
      title: 'Status timer warning: Responding for 2m',
      body: 'Engine 1: update your status if it has changed.',
      sound: 'modernunitnotice.wav',
      categoryIdentifier: STATUS_TIMER_CATEGORY_ID,
      interruptionLevel: 'timeSensitive',
      priority: 'high',
    });
    // The payload tells the push service it is the app's own notification, and which unit and episode it is about.
    expect(readLocalNotificationData(warn?.content.data)).toMatchObject({ localKind: 'statusTimer', scope: '12', episode: '12:501:1' });
  });

  it('leaves an unchanged notification alone, so syncing again on every roster refresh costs nothing', async () => {
    await syncLocalNotifications('statusTimer', timerSet());
    mockNotificationState.scheduling = [];
    await syncLocalNotifications('statusTimer', timerSet());
    expect(mockNotificationState.scheduling).toEqual([]);
  });

  it('reschedules what changed (new times for a new status, other wording) and keeps the rest', async () => {
    await syncLocalNotifications('statusTimer', timerSet());
    mockNotificationState.scheduling = [];

    const [warn, alert] = timerSet().notifications;
    await syncLocalNotifications('statusTimer', timerSet({ notifications: [warn, { ...alert, at: ALERT_AT + 60_000 }] }));
    expect(mockNotificationState.scheduling).toEqual(['cancel:statusTimer:12:alert', 'schedule:statusTimer:12:alert']);
    expect(mockNotificationState.scheduled.get('statusTimer:12:alert')?.trigger.date).toBe(ALERT_AT + 60_000);

    // A new status episode replaces both, even at the same offsets.
    mockNotificationState.scheduling = [];
    await syncLocalNotifications('statusTimer', timerSet({ episode: '12:502:2' }));
    expect(mockNotificationState.scheduling.filter((entry) => entry.startsWith('schedule:')).sort()).toEqual(['schedule:statusTimer:12:alert', 'schedule:statusTimer:12:warn']);
  });

  it('cancels what is no longer wanted: a step dispatch muted, or everything when the timer ends', async () => {
    await syncLocalNotifications('statusTimer', timerSet());
    const [, alert] = timerSet().notifications;
    await syncLocalNotifications('statusTimer', timerSet({ notifications: [alert] }));
    expect(scheduledIds()).toEqual(['statusTimer:12:alert']);

    await syncLocalNotifications('statusTimer', null);
    expect(scheduledIds()).toEqual([]);
  });

  it('never schedules a time already past', async () => {
    jest.setSystemTime(WARN_AT + 1_000);
    await syncLocalNotifications('statusTimer', timerSet());
    expect(scheduledIds()).toEqual(['statusTimer:12:alert']);
  });

  it('moves to another unit: cancels the old unit and schedules the new one', async () => {
    await syncLocalNotifications('statusTimer', timerSet());
    await syncLocalNotifications('statusTimer', timerSet({ scope: '34', episode: '34:9:1' }));
    expect(scheduledIds()).toEqual(['statusTimer:34:alert', 'statusTimer:34:warn']);
  });

  it('removes a delivered notice once its status has ended, and keeps it while the status runs', async () => {
    await syncLocalNotifications('statusTimer', timerSet());
    mockFireScheduled('statusTimer:12:warn');

    // Same episode (dispatch muted the alert, say): the delivered warning is still true.
    const [warn] = timerSet().notifications;
    await syncLocalNotifications('statusTimer', timerSet({ notifications: [warn] }));
    expect(mockNotificationState.presented.has('statusTimer:12:warn')).toBe(true);

    // The unit reported a new status: the warning is about a status that ended.
    await syncLocalNotifications('statusTimer', timerSet({ episode: '12:502:2', notifications: [] }));
    expect(mockNotificationState.presented.size).toBe(0);
  });

  it('runs one sync at a time, in call order', async () => {
    const first = syncLocalNotifications('statusTimer', timerSet());
    const second = syncLocalNotifications('statusTimer', null);
    await Promise.all([first, second]);
    expect(scheduledIds()).toEqual([]);
    expect(mockNotificationState.scheduling.slice(0, 2).every((entry) => entry.startsWith('schedule:'))).toBe(true);
  });

  it('logs and carries on when the OS refuses, and the next sync tries again', async () => {
    notifications.scheduleNotificationAsync.mockRejectedValueOnce(new Error('denied'));
    await expect(syncLocalNotifications('statusTimer', timerSet())).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ message: 'Local notifications could not be synced' }));

    await syncLocalNotifications('statusTimer', timerSet());
    expect(scheduledIds()).toEqual(['statusTimer:12:alert', 'statusTimer:12:warn']);
  });

  it('touches nothing but its own kind', async () => {
    mockNotificationState.scheduled.set('other', { identifier: 'other', content: { data: {} }, trigger: { type: 'date', date: ALERT_AT } });
    await syncLocalNotifications('statusTimer', null);
    expect(scheduledIds()).toEqual(['other']);
  });
});

describe('cancelAllLocalNotifications', () => {
  it('cancels every scheduled one and removes delivered ones (sign-out)', async () => {
    await syncLocalNotifications('statusTimer', timerSet());
    mockFireScheduled('statusTimer:12:warn');
    await cancelAllLocalNotifications();
    expect(scheduledIds()).toEqual([]);
    expect(mockNotificationState.presented.size).toBe(0);
  });
});

describe('exact alarms (Android 12+)', () => {
  beforeEach(() => {
    rn.Platform.OS = 'android';
  });

  it('reads whether the device may schedule exact alarms; nothing to allow off Android', async () => {
    await expect(getExactAlarmAccess()).resolves.toBe('granted');
    mockNotificationState.exactAlarms = false;
    await expect(getExactAlarmAccess()).resolves.toBe('denied');
    rn.Platform.OS = 'ios';
    await expect(getExactAlarmAccess()).resolves.toBe('notNeeded');
    await expect(requestExactAlarmAccess()).resolves.toBe('notNeeded');
    expect(notifications.requestExactAlarmPermissionsAsync).not.toHaveBeenCalled();
  });

  it('opens the system screen and reports what the user chose there', async () => {
    mockNotificationState.exactAlarms = false;
    await expect(requestExactAlarmAccess()).resolves.toBe('granted');
    mockNotificationState.exactAlarms = false;
    mockNotificationState.exactAlarmsAfterSettings = false;
    await expect(requestExactAlarmAccess()).resolves.toBe('denied');
  });

  it('reads as nothing to allow when the access cannot be read (no nagging)', async () => {
    notifications.getExactAlarmPermissionsAsync.mockRejectedValueOnce(new Error('unavailable'));
    await expect(getExactAlarmAccess()).resolves.toBe('notNeeded');
  });

  it('schedules again on time once exact alarms are allowed', async () => {
    mockNotificationState.exactAlarms = false;
    await syncLocalNotifications('statusTimer', timerSet());
    mockNotificationState.scheduling = [];

    // Unchanged while they stay off.
    await syncLocalNotifications('statusTimer', timerSet());
    expect(mockNotificationState.scheduling).toEqual([]);

    mockNotificationState.exactAlarms = true;
    await syncLocalNotifications('statusTimer', timerSet());
    expect(mockNotificationState.scheduling.filter((entry) => entry.startsWith('schedule:')).sort()).toEqual(['schedule:statusTimer:12:alert', 'schedule:statusTimer:12:warn']);
  });
});

describe('readLocalNotificationData', () => {
  it('reads only the payload the app wrote', () => {
    expect(readLocalNotificationData({ localKind: 'statusTimer', scope: '12', episode: 'e', signature: 's' })).toEqual({ localKind: 'statusTimer', scope: '12', episode: 'e', signature: 's' });
    expect(readLocalNotificationData({ eventCode: 'C:1' })).toBeNull();
    expect(readLocalNotificationData({ localKind: 'other', scope: '12', episode: 'e', signature: 's' })).toBeNull();
    expect(readLocalNotificationData({ localKind: 'statusTimer', scope: '', episode: 'e', signature: 's' })).toBeNull();
    expect(readLocalNotificationData(undefined)).toBeNull();
  });
});
