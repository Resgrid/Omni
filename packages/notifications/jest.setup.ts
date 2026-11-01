/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories are hoisted above imports, so they require modules lazily. */
// Package-local Jest mocks for @resgrid/notifications. Native modules have no implementation under Jest; the stand-ins in
// src/__tests__/mocks keep state tests can drive and inspect. jest.mock factories may only reference `mock*` names.

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
}));

jest.mock('@resgrid/core', () => require('./src/__tests__/mocks/core'));

jest.mock('@resgrid/i18n', () => ({
  translate: (key: string, options?: Record<string, unknown>) => {
    const fallback = typeof options?.defaultValue === 'string' ? options.defaultValue : key;
    return fallback.replace(/\{\{(\w+)\}\}/g, (match: string, name: string) => (options && name in options ? String(options[name]) : match));
  },
}));

jest.mock('expo-notifications', () => require('./src/__tests__/mocks/expo-notifications'));
jest.mock('@notifee/react-native', () => require('./src/__tests__/mocks/notifee'));
jest.mock('expo-device', () => require('./src/__tests__/mocks/expo-device'));
jest.mock('expo-audio', () => require('./src/__tests__/mocks/expo-audio'));
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn((module: number) => ({ uri: `asset://${module}`, localUri: `file://asset-${module}`, downloadAsync: jest.fn(async () => undefined) })),
  },
}));

// Hooks render through react-test-renderer's act().
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// react-test-renderer still works under React 19 but warns on every create(); only that warning is dropped.
const mockConsoleError = console.error.bind(console);
jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('react-test-renderer is deprecated')) return;
  mockConsoleError(...args);
});
