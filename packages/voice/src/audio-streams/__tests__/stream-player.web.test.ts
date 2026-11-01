// Dispatch audio-stream-store.web behaviour: HTMLAudioElement playback for web/Electron.
import { createStreamPlayer } from '../stream-player.web';

class FakeAudio {
  static instances: FakeAudio[] = [];
  crossOrigin = '';
  paused = true;
  src: string;
  private listeners = new Map<string, { fn: () => void; signal?: AbortSignal }[]>();
  play = jest.fn(async () => {
    this.paused = false;
  });
  pause = jest.fn(() => {
    this.paused = true;
  });
  load = jest.fn();

  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }

  addEventListener(type: string, fn: () => void, options?: { signal?: AbortSignal }) {
    const list = this.listeners.get(type) ?? [];
    list.push({ fn, signal: options?.signal });
    this.listeners.set(type, list);
  }

  emit(type: string) {
    (this.listeners.get(type) ?? []).filter((entry) => !entry.signal?.aborted).forEach((entry) => entry.fn());
  }
}

beforeEach(() => {
  FakeAudio.instances = [];
  Object.defineProperty(globalThis, 'Audio', { value: FakeAudio, configurable: true, writable: true });
});

const stream = { Id: '1', Name: 'Scanner', Type: 'mp3', Url: 'https://audio.example.com/1.mp3' };

it('plays through an audio element and reports status', async () => {
  const onStatus = jest.fn();
  const onError = jest.fn();
  const handle = await createStreamPlayer(stream, { onStatus, onError }, { background: true, keepRecording: false });
  const audio = FakeAudio.instances[0] as FakeAudio;
  expect(audio.play).toHaveBeenCalled();
  expect(audio.crossOrigin).toBe('anonymous');
  audio.emit('playing');
  expect(onStatus).toHaveBeenLastCalledWith({ playing: true, buffering: false });

  handle.stop();
  expect(audio.pause).toHaveBeenCalled();
  expect(audio.src).toBe('');
  audio.emit('playing');
  expect(onStatus).toHaveBeenCalledTimes(1);
});

it('reports errors and rejects when the browser refuses to play', async () => {
  const onError = jest.fn();
  await createStreamPlayer(stream, { onStatus: jest.fn(), onError }, { background: false, keepRecording: false });
  (FakeAudio.instances[0] as FakeAudio).emit('error');
  expect(onError).toHaveBeenCalled();

  const failing = class extends FakeAudio {
    override play = jest.fn(async () => {
      throw new Error('NotAllowedError');
    });
  };
  Object.defineProperty(globalThis, 'Audio', { value: failing, configurable: true, writable: true });
  await expect(createStreamPlayer(stream, { onStatus: jest.fn(), onError: jest.fn() }, { background: false, keepRecording: false })).rejects.toThrow('NotAllowedError');
});
