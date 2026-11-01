export const AudioSession = {
  startAudioSession: jest.fn(async () => undefined),
  stopAudioSession: jest.fn(async () => undefined),
  selectAudioOutput: jest.fn(async () => undefined),
  setAppleAudioConfiguration: jest.fn(async () => undefined),
};

export const registerGlobals = jest.fn();
