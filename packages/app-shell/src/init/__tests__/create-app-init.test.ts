import { createAppInit, DEFAULT_INIT_RETRY, initRetryDelay, type InitStep, InitStepTimeoutError } from '../create-app-init';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

const step = (id: string, log: string[], run?: () => void | Promise<void>): InitStep => ({
  id,
  run: async () => {
    log.push(id);
    await run?.();
  },
});

describe('createAppInit', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs steps in registry order and honours before/after positions', async () => {
    const log: string[] = [];
    const init = createAppInit({ name: 'test', steps: [step('a', log), step('c', log)] });
    init.register(step('b', log), { after: 'a' });
    init.register(step('first', log), { before: 'a' });
    init.register(step('last', log));

    const status = await init.run();

    expect(log).toEqual(['first', 'a', 'b', 'c', 'last']);
    expect(status.state).toBe('ready');
    expect(status.everReady).toBe(true);
    expect(status.completedSteps).toEqual(['first', 'a', 'b', 'c', 'last']);
  });

  it('is idempotent: completed steps never run twice and concurrent runs share one run', async () => {
    const log: string[] = [];
    const init = createAppInit({ name: 'test', steps: [step('a', log), step('b', log)] });

    const [first, second] = await Promise.all([init.run(), init.run()]);
    await init.run();

    expect(first).toBe(second);
    expect(log).toEqual(['a', 'b']);
  });

  it('skips disabled steps and carries on past a failing optional step', async () => {
    const log: string[] = [];
    const init = createAppInit({
      name: 'test',
      steps: [
        { id: 'off', enabled: () => false, run: () => void log.push('off') },
        {
          id: 'flaky',
          optional: true,
          run: () => {
            throw new Error('boom');
          },
        },
        step('after', log),
      ],
    });

    const status = await init.run();

    expect(status.state).toBe('ready');
    expect(log).toEqual(['after']);
  });

  it('stops the phase without failing when a step returns "stop"', async () => {
    const log: string[] = [];
    const init = createAppInit({ name: 'test', steps: [{ id: 'gate', run: () => 'stop' }, step('never', log)] });

    const status = await init.run();

    expect(status.state).toBe('stopped');
    expect(log).toEqual([]);
  });

  it('fails a step that exceeds its timeout (30 s by default)', async () => {
    jest.useFakeTimers();
    const init = createAppInit({ name: 'test', retry: false, steps: [{ id: 'slow', run: () => new Promise<void>(() => undefined) }] });

    const pending = init.run();
    await jest.advanceTimersByTimeAsync(29_999);
    expect(init.getStatus().state).toBe('running');
    await jest.advanceTimersByTimeAsync(1);
    const status = await pending;

    expect(status.state).toBe('failed');
    expect(status.failedStep).toBe('slow');
    expect(status.error).toBeInstanceOf(InitStepTimeoutError);
  });

  it('retries a failed run on a backoff, resuming at the failed step', async () => {
    jest.useFakeTimers();
    const log: string[] = [];
    let failures = 2;
    const init = createAppInit({
      name: 'test',
      steps: [
        step('a', log),
        step('b', log, () => {
          if (failures > 0) {
            failures -= 1;
            throw new Error('offline');
          }
        }),
      ],
    });

    let status = await init.run();
    expect(status.state).toBe('failed');
    expect(status.attempt).toBe(1);
    expect(status.nextRetryAt).not.toBeNull();

    await jest.advanceTimersByTimeAsync(initRetryDelay(1));
    await flush();
    expect(init.getStatus().attempt).toBe(2);
    expect(init.getStatus().state).toBe('failed');

    await jest.advanceTimersByTimeAsync(initRetryDelay(2));
    await flush();
    status = init.getStatus();

    expect(status.state).toBe('ready');
    expect(log).toEqual(['a', 'b', 'b', 'b']);
  });

  it('gives up after the attempt budget', async () => {
    jest.useFakeTimers();
    const init = createAppInit({
      name: 'test',
      retry: { baseDelayMs: 10, maxDelayMs: 10, maxAttempts: 2 },
      steps: [
        {
          id: 'broken',
          run: () => {
            throw new Error('nope');
          },
        },
      ],
    });

    await init.run();
    await jest.advanceTimersByTimeAsync(10);
    await flush();

    expect(init.getStatus().attempt).toBe(2);
    expect(init.getStatus().nextRetryAt).toBeNull();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(init.getStatus().attempt).toBe(2);
  });

  it('retryNow runs immediately and restores the budget', async () => {
    let fail = true;
    const init = createAppInit({
      name: 'test',
      retry: false,
      steps: [
        {
          id: 'x',
          run: () => {
            if (fail) {
              throw new Error('x');
            }
          },
        },
      ],
    });
    await init.run();
    fail = false;

    const status = await init.retryNow();

    expect(status.state).toBe('ready');
    expect(status.attempt).toBe(1);
  });

  it('generation guard: a run from before reset() can no longer change the status', async () => {
    let release: () => void = () => undefined;
    const log: string[] = [];
    const init = createAppInit({
      name: 'test',
      steps: [
        {
          id: 'slow',
          run: () =>
            new Promise<void>((resolve) => {
              release = resolve;
            }),
        },
        step('after', log),
      ],
    });

    const stale = init.run();
    await flush();
    init.reset();
    expect(init.getStatus().generation).toBe(1);
    release();
    await stale;

    expect(log).toEqual([]);
    expect(init.getStatus().state).toBe('idle');
    expect(init.getStatus().completedSteps).toEqual([]);
  });

  it('reset cancels a scheduled retry and forgets completed steps', async () => {
    jest.useFakeTimers();
    const log: string[] = [];
    let fail = true;
    const init = createAppInit({
      name: 'test',
      steps: [
        step('a', log),
        step('b', log, () => {
          if (fail) {
            throw new Error('b');
          }
        }),
      ],
    });
    await init.run();
    init.reset();
    fail = false;
    await jest.advanceTimersByTimeAsync(DEFAULT_INIT_RETRY.maxDelayMs);
    expect(log).toEqual(['a', 'b']);

    await init.run();
    expect(log).toEqual(['a', 'b', 'a', 'b']);
  });

  it('backoff doubles from 5 s up to 60 s', () => {
    expect([1, 2, 3, 4, 5, 6].map((attempt) => initRetryDelay(attempt))).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
  });

  it('notifies subscribers with each status change', async () => {
    const init = createAppInit({ name: 'test', steps: [{ id: 'a', run: () => undefined }] });
    const states: string[] = [];
    const unsubscribe = init.subscribe((status) => states.push(`${status.state}:${status.currentStep ?? '-'}`));

    await init.run();
    unsubscribe();

    expect(states[0]).toBe('running:-');
    expect(states).toContain('running:a');
    expect(states[states.length - 1]).toBe('ready:-');
  });
});
