import type { MicrophoneController, PttInputSource } from '../../ptt/microphone-controller';
import type { VoicePreferenceStorage } from '../../runtime';

export interface TestMicrophoneController extends MicrophoneController {
  enabled: boolean;
  active: boolean;
  connecting: boolean;
  isActive: jest.Mock<boolean, []>;
  isConnecting: jest.Mock<boolean, []>;
  isMicrophoneEnabled: jest.Mock<boolean, []>;
  setMicrophoneEnabled: jest.Mock<Promise<void>, [boolean, PttInputSource]>;
  toggleMicrophone: jest.Mock<Promise<void>, [PttInputSource]>;
}

/** A microphone controller standing in for the LiveKit store (active room by default). */
export const createTestMicrophoneController = (): TestMicrophoneController => {
  const controller: TestMicrophoneController = {
    enabled: false,
    active: true,
    connecting: false,
    isActive: jest.fn(() => controller.active),
    isConnecting: jest.fn(() => controller.connecting),
    isMicrophoneEnabled: jest.fn(() => controller.enabled),
    setMicrophoneEnabled: jest.fn(async (enabled: boolean, _source: PttInputSource) => {
      controller.enabled = enabled;
    }),
    toggleMicrophone: jest.fn(async (_source: PttInputSource) => {
      controller.enabled = !controller.enabled;
    }),
  };
  return controller;
};

export interface TestStorage extends VoicePreferenceStorage {
  values: Map<string, unknown>;
  setJSON: jest.Mock<boolean, [string, unknown]>;
  delete: jest.Mock<void, [string]>;
}

/** In-memory stand-in for the DurableKv subset voice uses. */
export const createTestStorage = (): TestStorage => {
  const values = new Map<string, unknown>();
  const getJSON = <T>(key: string): T | null => (values.has(key) ? (values.get(key) as T) : null);
  return {
    values,
    getJSON: getJSON as VoicePreferenceStorage['getJSON'],
    setJSON: jest.fn((key: string, value: unknown) => {
      values.set(key, value);
      return true;
    }),
    delete: jest.fn((key: string) => {
      values.delete(key);
    }),
  };
};
