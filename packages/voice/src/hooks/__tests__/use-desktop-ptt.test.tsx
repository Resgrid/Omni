// Desktop console hotkey PTT (Dispatch, web/Electron): press/release, focus loss and capability gating.
import { act, renderHook } from '@testing-library/react-native';

import { createInitialLiveKitState, useLiveKitStore } from '../../livekit/livekit-store';
import { useDesktopPtt } from '../use-desktop-ptt';

jest.mock('@resgrid/api', () => ({ getDepartmentVoiceSettings: jest.fn(), canConnectToVoiceSession: jest.fn(), getDepartmentAudioStreams: jest.fn() }));

const mockCapabilities = { ptt: true, callKeep: false, bluetoothPtt: false, headsetButtonPtt: false, desktopPtt: true, backgroundAudio: true };
jest.mock('../../capabilities', () => ({ getVoiceCapabilities: () => mockCapabilities }));

type Listener = (event: never) => void;

const makeTarget = () => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    visibilityState: 'visible',
    addEventListener: (type: string, listener: Listener) => {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type))?.add(listener);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type: string, event: object = {}) {
      [...(listeners.get(type) ?? [])].forEach((listener) => (listener as (e: object) => void)(event));
    },
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
};

const key = (code: string) => ({ code, preventDefault: jest.fn() });

let startTransmitting: jest.Mock;
let stopTransmitting: jest.Mock;
let targets: { window: ReturnType<typeof makeTarget>; document: ReturnType<typeof makeTarget> };

beforeEach(() => {
  mockCapabilities.desktopPtt = true;
  startTransmitting = jest.fn(async () => undefined);
  stopTransmitting = jest.fn(async () => undefined);
  useLiveKitStore.setState({ ...createInitialLiveKitState(), isConnected: true, startTransmitting, stopTransmitting });
  targets = { window: makeTarget(), document: makeTarget() };
});

it('transmits while the hotkey is held and releases on key up', () => {
  const { result } = renderHook(() => useDesktopPtt({ targets }));
  expect(result.current.isActive).toBe(true);

  act(() => targets.window.dispatch('keydown', key('Space')));
  expect(startTransmitting).toHaveBeenCalledWith('desktop');
  expect(result.current.isHotkeyDown).toBe(true);

  act(() => targets.window.dispatch('keyup', key('Space')));
  expect(stopTransmitting).toHaveBeenCalledWith('desktop');
  expect(result.current.isHotkeyDown).toBe(false);
});

it('releases when the window loses focus mid-transmission', () => {
  renderHook(() => useDesktopPtt({ targets }));
  act(() => targets.window.dispatch('keydown', key('Space')));
  act(() => targets.window.dispatch('blur'));
  expect(stopTransmitting).toHaveBeenCalledTimes(1);
});

it('uses a configured hotkey', () => {
  renderHook(() => useDesktopPtt({ targets, hotkey: { code: 'F13' } }));
  act(() => targets.window.dispatch('keydown', key('Space')));
  expect(startTransmitting).not.toHaveBeenCalled();
  act(() => targets.window.dispatch('keydown', key('F13')));
  expect(startTransmitting).toHaveBeenCalled();
});

it('does nothing when no channel is joined', () => {
  useLiveKitStore.setState({ isConnected: false });
  renderHook(() => useDesktopPtt({ targets }));
  act(() => targets.window.dispatch('keydown', key('Space')));
  expect(startTransmitting).not.toHaveBeenCalled();
});

it('stays inert for variants without desktop PTT and detaches on unmount', () => {
  mockCapabilities.desktopPtt = false;
  const { result } = renderHook(() => useDesktopPtt({ targets }));
  expect(result.current.isActive).toBe(false);
  expect(targets.window.count('keydown')).toBe(0);

  mockCapabilities.desktopPtt = true;
  const mounted = renderHook(() => useDesktopPtt({ targets }));
  expect(targets.window.count('keydown')).toBe(1);
  mounted.unmount();
  expect(targets.window.count('keydown')).toBe(0);
});
