import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { dataProtectionStore } from '../data-protection/grant-store';
import { useProtectedGrantRefresh } from '../data-protection/use-protected-grant-refresh';
import { featureFlagsStore, useFeatureFlag, useFeatureFlagStatus } from '../flags/feature-flags-store';
import { useAuth } from '../hooks';
import { securityStore, useSecurity } from '../rights/security-store';
import { useAuthStore } from '../session/auth-store';
import { terminologyStore, useTerm } from '../terminology/terminology-store';
import { setupHarness } from './helpers/harness';

// Hook tests run in Node with react-test-renderer (no React Native rendering is involved).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React 19 marks react-test-renderer deprecated; the warning is not about this package.
const consoleError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('react-test-renderer is deprecated')) {
      return;
    }
    consoleError(...args);
  });
});
afterAll(() => {
  jest.restoreAllMocks();
});

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((renderer) => renderer.unmount());
  });
});

function renderHook<T>(hook: () => T): { current: () => T; renderer: ReactTestRenderer } {
  let value: T;
  function Probe(): null {
    value = hook();
    return null;
  }
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(<Probe />);
  });
  mounted.push(renderer as ReactTestRenderer);
  return { current: () => value, renderer: renderer as ReactTestRenderer };
}

describe('hooks', () => {
  beforeEach(() => setupHarness('unit'));

  it('useFeatureFlag / useFeatureFlagStatus: unknown flags are disabled and update reactively', () => {
    const flag = renderHook(() => useFeatureFlag('Chat.System'));
    const status = renderHook(() => useFeatureFlagStatus('Chat.System'));
    expect(flag.current()).toBe(false);
    expect(status.current()).toBe('unknown');
    act(() => {
      featureFlagsStore.setState({ flags: { 'Chat.System': { enabled: true } }, isLoaded: true });
    });
    expect(flag.current()).toBe(true);
    expect(status.current()).toBe('enabled');
  });

  it('useTerm falls back to the app’s own name', () => {
    const term = renderHook(() => useTerm('module.calls', 'Calls'));
    expect(term.current()).toBe('Calls');
    act(() => {
      terminologyStore.setState({ names: { 'module.calls': 'Incidents' } });
    });
    expect(term.current()).toBe('Incidents');
  });

  it('useSecurity derives the gating view from the rights', () => {
    const view = renderHook(() => useSecurity());
    expect(view.current().canUserCreateCalls).toBe(false);
    act(() => {
      securityStore.setState({ rights: { DepartmentId: '1', CanCreateCalls: true, Groups: [{ GroupId: 2, IsGroupAdmin: true }] } as never });
    });
    expect(view.current().canUserCreateCalls).toBe(true);
    expect(view.current().isUserGroupAdmin(2)).toBe(true);
    expect(view.current().isUserGroupAdmin(3)).toBe(false);
  });

  it('useAuth exposes what the login screens render', () => {
    const auth = renderHook(() => useAuth());
    expect(auth.current()).toMatchObject({ status: 'idle', isAuthenticated: false, mfaChallenge: null });
    act(() => {
      useAuthStore.setState({ status: 'mfaRequired', mfaChallenge: { kind: 'verify', methods: ['totp'], enrolled: ['totp'], preferred: 'totp', expiresAt: null, source: 'password' } });
    });
    expect(auth.current().mfaChallenge?.kind).toBe('verify');
  });

  it('useProtectedGrantRefresh refreshes when the grant changes and again after it expires (IC)', () => {
    jest.useFakeTimers();
    const refresh = jest.fn();
    renderHook(() => useProtectedGrantRefresh(refresh));
    expect(refresh).not.toHaveBeenCalled();
    act(() => {
      dataProtectionStore.setState({ grantToken: 'g', stepUpExpiresAt: Date.now() + 10_000 });
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(11_000);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
