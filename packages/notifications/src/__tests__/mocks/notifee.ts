// Stand-in for @notifee/react-native: records channels, categories and event observers.
type Observer = (event: { type: number; detail: { pressAction?: { id: string }; notification?: { id?: string; title?: string; body?: string; data?: Record<string, unknown> } } }) => unknown;

export const mockNotifeeState = {
  channels: [] as { id: string; sound?: string; name?: string; vibration?: boolean }[],
  existingChannels: [] as { id: string; sound?: string; blocked: boolean }[],
  deleted: [] as string[],
  categories: [] as { id: string; actions?: { id: string; title: string; foreground?: boolean }[] }[],
  foreground: new Set<Observer>(),
  background: null as Observer | null,
  authorizationStatus: 1,
  calls: [] as string[],
};

export const AndroidImportance = { DEFAULT: 3, HIGH: 4, LOW: 2, MIN: 1, NONE: 0 };
export const AndroidVisibility = { PRIVATE: 0, PUBLIC: 1, SECRET: -1 };
export const AuthorizationStatus = { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 };
export const EventType = { UNKNOWN: -1, DISMISSED: 0, PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3 };

const notifee = {
  getChannels: jest.fn(async () => {
    mockNotifeeState.calls.push('getChannels');
    return mockNotifeeState.existingChannels;
  }),
  deleteChannel: jest.fn(async (id: string) => {
    mockNotifeeState.deleted.push(id);
  }),
  createChannels: jest.fn(async (channels: { id: string; sound?: string }[]) => {
    mockNotifeeState.calls.push('createChannels');
    mockNotifeeState.channels.push(...channels);
  }),
  createChannel: jest.fn(async (channel: { id: string; sound?: string }) => {
    mockNotifeeState.channels.push(channel);
    return channel.id;
  }),
  setNotificationCategories: jest.fn(async (categories: { id: string }[]) => {
    mockNotifeeState.calls.push('setNotificationCategories');
    mockNotifeeState.categories = categories;
  }),
  onForegroundEvent: jest.fn((observer: Observer) => {
    mockNotifeeState.foreground.add(observer);
    return () => mockNotifeeState.foreground.delete(observer);
  }),
  onBackgroundEvent: jest.fn((observer: Observer) => {
    mockNotifeeState.background = observer;
  }),
  requestPermission: jest.fn(async (_permissions?: unknown) => ({ authorizationStatus: mockNotifeeState.authorizationStatus })),
  cancelAllNotifications: jest.fn(async () => undefined),
  setBadgeCount: jest.fn(async () => undefined),
};

export default notifee;

export const mockResetNotifee = (): void => {
  mockNotifeeState.channels = [];
  mockNotifeeState.existingChannels = [];
  mockNotifeeState.deleted = [];
  mockNotifeeState.categories = [];
  mockNotifeeState.foreground.clear();
  mockNotifeeState.background = null;
  mockNotifeeState.authorizationStatus = AuthorizationStatus.AUTHORIZED;
  mockNotifeeState.calls = [];
};
