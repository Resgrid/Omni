// expo-audio fake: audio mode, recording permission and players whose status updates tests can emit.
type StatusListener = (status: any) => void;

export class FakeAudioPlayer {
  static instances: FakeAudioPlayer[] = [];
  loop = false;
  volume = 1;
  muted = false;
  isLoaded = true;
  private listeners: StatusListener[] = [];
  play = jest.fn();
  pause = jest.fn();
  remove = jest.fn();
  seekTo = jest.fn(async () => undefined);
  setActiveForLockScreen = jest.fn();
  clearLockScreenControls = jest.fn();

  constructor(
    readonly source: unknown,
    readonly options: unknown
  ) {
    FakeAudioPlayer.instances.push(this);
  }

  addListener(_event: string, listener: StatusListener) {
    this.listeners.push(listener);
    return { remove: () => undefined };
  }

  emitStatus(status: Record<string, unknown>): void {
    this.listeners.forEach((listener) => listener({ playing: false, isBuffering: false, error: null, ...status }));
  }
}

export const createAudioPlayer = jest.fn((source: unknown, options?: unknown) => new FakeAudioPlayer(source, options));
export const setAudioModeAsync = jest.fn(async () => undefined);
export const getRecordingPermissionsAsync = jest.fn(async () => ({ granted: true, canAskAgain: true }));
export const requestRecordingPermissionsAsync = jest.fn(async () => ({ granted: true, canAskAgain: true }));

export type AudioPlayer = FakeAudioPlayer;
export type AudioStatus = { playing: boolean; isBuffering: boolean; error: string | null };
