// react-native-callkeep fake with an event registry tests can emit into.
type Handler = (payload: any) => void;
const handlers = new Map<string, Handler>();

export enum AudioSessionCategoryOption {
  mixWithOthers = 0x1,
  duckOthers = 0x2,
  allowBluetooth = 0x4,
  defaultToSpeaker = 0x8,
  allowBluetoothA2DP = 0x20,
  allowAirPlay = 0x40,
}

export enum AudioSessionMode {
  voiceChat = 'AVAudioSessionModeVoiceChat',
}

const RNCallKeep = {
  setup: jest.fn(async () => true),
  setAvailable: jest.fn(),
  startCall: jest.fn(),
  reportConnectingOutgoingCallWithUUID: jest.fn(),
  reportConnectedOutgoingCallWithUUID: jest.fn(),
  setCurrentCallActive: jest.fn(),
  endCall: jest.fn(),
  setMutedCall: jest.fn(),
  addEventListener: jest.fn((event: string, handler: Handler) => {
    handlers.set(event, handler);
    return { remove: () => handlers.delete(event) };
  }),
  removeEventListener: jest.fn((event: string) => {
    handlers.delete(event);
  }),
};

export const emitCallKeepEvent = (event: string, payload?: unknown): void => handlers.get(event)?.(payload);
export const resetCallKeepFake = (): void => handlers.clear();

export default RNCallKeep;
