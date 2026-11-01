import { resetReactNativeFake } from '../../__tests__/fakes/react-native';
import { activateVariant } from '../../__tests__/helpers/variant';
import { resetCallKeepServiceForTests } from '../../callkeep/callkeep-service';
import { registerMicrophoneController } from '../microphone-controller';
import { PttPressController } from '../ptt-press-controller';

const makeController = () => {
  const controller = {
    active: true,
    connecting: false,
    enabled: false,
    resolvers: [] as (() => void)[],
    deferred: false,
    isActive: () => controller.active,
    isConnecting: () => controller.connecting,
    isMicrophoneEnabled: () => controller.enabled,
    setMicrophoneEnabled: jest.fn(
      (enabled: boolean) =>
        new Promise<void>((resolve) => {
          const done = () => {
            controller.enabled = enabled;
            resolve();
          };
          if (controller.deferred) controller.resolvers.push(done);
          else done();
        })
    ),
    toggleMicrophone: jest.fn(async () => {
      controller.enabled = !controller.enabled;
    }),
  };
  return controller;
};

let controller: ReturnType<typeof makeController>;

beforeEach(() => {
  jest.useFakeTimers();
  resetReactNativeFake();
  activateVariant('unit');
  resetCallKeepServiceForTests();
  controller = makeController();
  registerMicrophoneController(controller);
});

afterEach(() => {
  registerMicrophoneController(null);
  jest.useRealTimers();
});

it('serializes microphone changes and applies only the latest pending request', async () => {
  const press = new PttPressController('bluetooth');
  controller.deferred = true;
  press.press();
  press.release();
  press.press();
  expect(controller.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
  controller.deferred = false;
  controller.resolvers.shift()?.();
  await press.whenIdle();
  expect(controller.setMicrophoneEnabled.mock.calls.map((call) => call[0])).toEqual([true, true]);
  expect(controller.enabled).toBe(true);
});

it('does nothing for a release without a press', async () => {
  const press = new PttPressController('bluetooth');
  press.release();
  await press.whenIdle();
  expect(controller.setMicrophoneEnabled).not.toHaveBeenCalled();
});

it('reset drops a queued unmute but releases a held press', async () => {
  const press = new PttPressController('bluetooth');
  press.press();
  await press.whenIdle();
  press.reset();
  await press.whenIdle();
  expect(controller.setMicrophoneEnabled).toHaveBeenLastCalledWith(false, 'bluetooth');
  expect(press.isPressed()).toBe(false);
});

it('toggle only acts when a channel is active', async () => {
  const press = new PttPressController('headset');
  controller.active = false;
  await press.toggle();
  expect(controller.toggleMicrophone).not.toHaveBeenCalled();
  controller.active = true;
  await press.toggle();
  expect(controller.toggleMicrophone).toHaveBeenCalledWith('headset');
});
