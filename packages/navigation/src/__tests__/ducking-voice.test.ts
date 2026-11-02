import { type AudioDucking, createDuckingVoice, type SpeechEngine } from '../store/ducking-voice';

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

function setup(lowered = true) {
  const finishers: (() => void)[] = [];
  const engine: SpeechEngine & { speak: jest.Mock; stop: jest.Mock } = {
    speak: jest.fn((_text: string, onFinished: () => void) => {
      finishers.push(onFinished);
    }),
    stop: jest.fn(),
  };
  const ducking: AudioDucking & { begin: jest.Mock; end: jest.Mock } = { begin: jest.fn(async () => lowered), end: jest.fn(async () => true) };
  return { engine, ducking, finishers, voice: createDuckingVoice(engine, ducking) };
}

describe('createDuckingVoice', () => {
  it('lowers other audio, speaks, and gives it back when the prompt ends', async () => {
    const { engine, ducking, finishers, voice } = setup();
    voice.speak('Turn left onto Main Street');
    await flush();

    expect(ducking.begin).toHaveBeenCalledTimes(1);
    expect(engine.speak).toHaveBeenCalledWith('Turn left onto Main Street', expect.any(Function));
    expect(ducking.end).not.toHaveBeenCalled();

    finishers[0]();
    expect(ducking.end).toHaveBeenCalledTimes(1);
  });

  it('keeps the audio lowered across back-to-back prompts and speaks only the newest', async () => {
    const { engine, ducking, finishers, voice } = setup();
    voice.speak('In 500 feet, turn right');
    voice.speak('Turn right');
    await flush();

    expect(ducking.begin).toHaveBeenCalledTimes(1);
    expect(engine.speak).toHaveBeenCalledTimes(1);
    expect(engine.speak).toHaveBeenCalledWith('Turn right', expect.any(Function));

    voice.speak('Continue for 2 miles');
    await flush();
    // The replaced prompt finishing (stopped) does not give the audio back while the next one plays.
    finishers[0]();
    expect(ducking.end).not.toHaveBeenCalled();
    expect(ducking.begin).toHaveBeenCalledTimes(1);

    finishers[1]();
    expect(ducking.end).toHaveBeenCalledTimes(1);
  });

  it('stop silences the prompt and restores the audio once', async () => {
    const { engine, ducking, voice } = setup();
    voice.speak('Arriving at the call');
    await flush();
    voice.stop();
    voice.stop();

    expect(engine.stop).toHaveBeenCalled();
    expect(ducking.end).toHaveBeenCalledTimes(1);
  });

  it('drops a prompt stopped while the audio was being lowered and gives the audio back', async () => {
    const { engine, ducking, voice } = setup();
    voice.speak('In 500 feet, turn left');
    voice.speak('Turn left');
    voice.stop();
    await flush();

    expect(engine.speak).not.toHaveBeenCalled();
    expect(ducking.begin).toHaveBeenCalledTimes(1);
    expect(ducking.end).toHaveBeenCalledTimes(1);
  });

  it('keeps the audio lowered for a prompt that follows a stop while the audio was being lowered', async () => {
    const { engine, ducking, finishers, voice } = setup();
    voice.speak('Turn left');
    voice.stop();
    voice.speak('Turn right');
    await flush();

    expect(ducking.begin).toHaveBeenCalledTimes(1);
    expect(engine.speak).toHaveBeenCalledTimes(1);
    expect(engine.speak).toHaveBeenCalledWith('Turn right', expect.any(Function));
    expect(ducking.end).not.toHaveBeenCalled();

    finishers[0]();
    expect(ducking.end).toHaveBeenCalledTimes(1);
  });

  it('speaks without ducking when the native side refuses (a call owns the audio)', async () => {
    const { engine, ducking, finishers, voice } = setup(false);
    voice.speak('Turn left');
    await flush();

    expect(engine.speak).toHaveBeenCalledTimes(1);
    finishers[0]();
    expect(ducking.end).not.toHaveBeenCalled();

    // The next prompt asks again.
    voice.speak('Turn right');
    await flush();
    expect(ducking.begin).toHaveBeenCalledTimes(2);
  });

  it('speaks when lowering the audio fails', async () => {
    const { engine, ducking, voice } = setup();
    ducking.begin.mockRejectedValueOnce(new Error('session error'));
    voice.speak('Turn left');
    await flush();

    expect(engine.speak).toHaveBeenCalledTimes(1);
  });
});
