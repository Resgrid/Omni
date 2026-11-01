// The `.web.ts` leaves Metro picks for web/Electron. Kept in their own file: the lint resolver maps `x` and `x.web` to
// the same module, so importing both in one file is reported (and autofixed) as a duplicate import.
import { getCallKeepService } from '../callkeep/callkeep-service.web';
import { noopCallKeepService } from '../callkeep/types';
import { getHeadsetButtonService } from '../headset/headset-button-service.web';
import { ensureMicrophonePermission } from '../livekit/microphone-permission.web';
import { activateVariant } from './helpers/variant';

const setNavigator = (value: unknown) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });

afterEach(() => setNavigator(undefined));

it('CallKeep is a no-op on web even for CallKeep variants', () => {
  activateVariant('unit');
  expect(getCallKeepService()).toBe(noopCallKeepService);
});

it('headset buttons are an inert stub on web', () => {
  const web = getHeadsetButtonService();
  web.startMonitoring();
  expect(web.isSupported).toBe(false);
  expect(web.isMonitoringActive()).toBe(false);
});

it('web microphone permission prompts with getUserMedia: denial blocks, no microphone joins listen-only', async () => {
  const stop = jest.fn();
  const getUserMedia = jest.fn(async () => ({ getTracks: () => [{ stop }] }));
  setNavigator({ mediaDevices: { getUserMedia } });
  await expect(ensureMicrophonePermission()).resolves.toEqual({ granted: true, canAskAgain: true });
  expect(stop).toHaveBeenCalled();
  getUserMedia.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  await expect(ensureMicrophonePermission()).resolves.toEqual({ granted: false, canAskAgain: false });
  getUserMedia.mockRejectedValueOnce(Object.assign(new Error('none'), { name: 'NotFoundError' }));
  await expect(ensureMicrophonePermission()).resolves.toEqual({ granted: true, canAskAgain: true });
});

it('web microphone permission joins listen-only without the MediaDevices API', async () => {
  setNavigator({});
  await expect(ensureMicrophonePermission()).resolves.toEqual({ granted: true, canAskAgain: true });
});
