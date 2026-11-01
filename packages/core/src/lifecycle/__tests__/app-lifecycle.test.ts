import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import { APP_STATE_DEBOUNCE_MS, type AppLifecycleState, getAppLifecycleState, resetAppLifecycleForTests, startAppLifecycle, subscribeAppLifecycle, useAppLifecycle } from '../app-lifecycle';

jest.mock('react-native', () => {
  const handlers: ((state: string) => void)[] = [];
  return {
    Platform: { OS: 'ios' },
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn((_event: string, handler: (state: string) => void) => {
        handlers.push(handler);
        return { remove: () => handlers.splice(handlers.indexOf(handler), 1) };
      }),
      __emit: (state: string) => handlers.forEach((h) => h(state)),
      __count: () => handlers.length,
    },
  };
});
jest.mock('react-native-logs', () => ({ consoleTransport: jest.fn(), logger: { createLogger: () => ({}) } }));

const rn = jest.requireMock('react-native') as { Platform: { OS: string }; AppState: { currentState: string; addEventListener: jest.Mock; __emit: (s: string) => void; __count: () => number } };

describe('app lifecycle (Dispatch baseline)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    rn.Platform.OS = 'ios';
    rn.AppState.currentState = 'active';
    resetAppLifecycleForTests();
    rn.AppState.addEventListener.mockClear();
  });

  afterEach(() => {
    resetAppLifecycleForTests();
    jest.useRealTimers();
  });

  it('subscribes to AppState once', () => {
    startAppLifecycle();
    startAppLifecycle();
    expect(rn.AppState.addEventListener).toHaveBeenCalledTimes(1);
    expect(rn.AppState.__count()).toBe(1);
  });

  it('debounces a burst and applies the LAST state (never strands the app in "inactive")', () => {
    startAppLifecycle();
    const seen: string[] = [];
    subscribeAppLifecycle(() => seen.push(getAppLifecycleState().appState));

    rn.AppState.__emit('inactive');
    rn.AppState.__emit('background');
    expect(getAppLifecycleState().appState).toBe('active');

    jest.advanceTimersByTime(APP_STATE_DEBOUNCE_MS);
    expect(getAppLifecycleState()).toEqual(expect.objectContaining({ appState: 'background', isActive: false, isBackground: true }));
    expect(seen).toEqual(['background']);
  });

  it('stamps lastActiveTimestamp when the app returns to active', () => {
    jest.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    startAppLifecycle();
    rn.AppState.__emit('background');
    jest.advanceTimersByTime(APP_STATE_DEBOUNCE_MS);
    rn.AppState.__emit('active');
    jest.advanceTimersByTime(APP_STATE_DEBOUNCE_MS);
    expect(getAppLifecycleState().isActive).toBe(true);
    expect(getAppLifecycleState().lastActiveTimestamp).toBe(new Date('2026-10-31T12:00:00Z').getTime() + 2 * APP_STATE_DEBOUNCE_MS);
  });

  it('ignores repeated identical states', () => {
    startAppLifecycle();
    const listener = jest.fn();
    subscribeAppLifecycle(listener);
    rn.AppState.__emit('active');
    jest.advanceTimersByTime(APP_STATE_DEBOUNCE_MS);
    expect(listener).not.toHaveBeenCalled();
  });

  it('never subscribes on web and always reports active, so hidden tabs keep their hubs (§10.3)', () => {
    rn.Platform.OS = 'web';
    resetAppLifecycleForTests();
    startAppLifecycle();
    expect(rn.AppState.addEventListener).not.toHaveBeenCalled();
    expect(getAppLifecycleState()).toEqual({ appState: 'active', isActive: true, isBackground: false, lastActiveTimestamp: null });
  });

  describe('useAppLifecycle', () => {
    const renderHook = () => {
      const results: AppLifecycleState[] = [];
      const Probe = () => {
        results.push(useAppLifecycle());
        return null;
      };
      let renderer: ReturnType<typeof create> | undefined;
      act(() => {
        renderer = create(createElement(Probe));
      });
      return { results, unmount: () => act(() => renderer?.unmount()) };
    };

    let consoleError: jest.SpyInstance;
    beforeEach(() => {
      // react-test-renderer prints a deprecation notice under React 19.
      consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => consoleError.mockRestore());

    it('starts the listener and re-renders with a new object only when a field changes', () => {
      const { results, unmount } = renderHook();
      expect(rn.AppState.addEventListener).toHaveBeenCalledTimes(1);
      const first = results[results.length - 1];
      expect(first.isActive).toBe(true);

      act(() => {
        rn.AppState.__emit('background');
        jest.advanceTimersByTime(APP_STATE_DEBOUNCE_MS);
      });
      const second = results[results.length - 1];
      expect(second).not.toBe(first);
      expect(second.isBackground).toBe(true);
      unmount();
    });

    it('returns the constant active object on web', () => {
      rn.Platform.OS = 'web';
      resetAppLifecycleForTests();
      const { results, unmount } = renderHook();
      expect(results[results.length - 1]).toEqual({ appState: 'active', isActive: true, isBackground: false, lastActiveTimestamp: null });
      expect(rn.AppState.addEventListener).not.toHaveBeenCalled();
      unmount();
    });
  });
});
