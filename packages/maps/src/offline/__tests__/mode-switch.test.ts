import { OFFLINE_SWITCH_MAX_HOLD_MS, OFFLINE_SWITCH_STABLE_MS, OfflineModeSwitch } from '../mode-switch';

/** Manual clock and timers. */
function clock() {
  let now = 1_000_000;
  const timers = new Map<number, { at: number; callback: () => void }>();
  let next = 1;
  return {
    now: () => now,
    setTimer: (callback: () => void, ms: number) => {
      const id = next++;
      timers.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimer: (handle: unknown) => {
      timers.delete(handle as number);
    },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...timers.entries()].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    pending: () => timers.size,
  };
}

describe('OfflineModeSwitch (D16)', () => {
  it('starts with the reported connectivity, goes offline at once on a loss and back only after 30 s of connectivity', () => {
    const time = clock();
    const modeSwitch = new OfflineModeSwitch(true, time);
    const changes: boolean[] = [];
    modeSwitch.subscribe(() => changes.push(modeSwitch.isOnline()));
    expect(modeSwitch.isOnline()).toBe(true);

    modeSwitch.setConnectivity(false);
    expect(modeSwitch.isOnline()).toBe(false);
    modeSwitch.setConnectivity(true);
    time.advance(OFFLINE_SWITCH_STABLE_MS - 1);
    expect(modeSwitch.isOnline()).toBe(false);

    // A drop inside the window restarts it.
    modeSwitch.setConnectivity(false);
    modeSwitch.setConnectivity(true);
    time.advance(OFFLINE_SWITCH_STABLE_MS - 1);
    expect(modeSwitch.isOnline()).toBe(false);
    time.advance(1);
    expect(modeSwitch.isOnline()).toBe(true);
    expect(changes).toEqual([false, true]);

    expect(new OfflineModeSwitch(false, time).isOnline()).toBe(false);
  });

  it('switches after more than 5 tile errors within 30 s, not after 5 or after errors spread out', () => {
    const time = clock();
    const modeSwitch = new OfflineModeSwitch(true, time);
    for (let i = 0; i < 5; i++) modeSwitch.reportError('tile');
    expect(modeSwitch.isOnline()).toBe(true);
    time.advance(30_000);
    modeSwitch.reportError('tile');
    expect(modeSwitch.isOnline()).toBe(true);
    for (let i = 0; i < 5; i++) modeSwitch.reportError('tile');
    expect(modeSwitch.isOnline()).toBe(false);
    time.advance(OFFLINE_SWITCH_STABLE_MS);
    expect(modeSwitch.isOnline()).toBe(true);
  });

  it('switches at once when the style fails to load, and backs off when errors resume right after', () => {
    const time = clock();
    const modeSwitch = new OfflineModeSwitch(true, time);
    modeSwitch.reportError('style');
    expect(modeSwitch.isOnline()).toBe(false);
    time.advance(OFFLINE_SWITCH_STABLE_MS);
    expect(modeSwitch.isOnline()).toBe(true);

    modeSwitch.reportError('style');
    time.advance(OFFLINE_SWITCH_STABLE_MS);
    expect(modeSwitch.isOnline()).toBe(false);
    time.advance(OFFLINE_SWITCH_STABLE_MS);
    expect(modeSwitch.isOnline()).toBe(true);

    for (let trip = 0; trip < 10; trip++) {
      modeSwitch.reportError('style');
      time.advance(OFFLINE_SWITCH_MAX_HOLD_MS);
    }
    expect(modeSwitch.isOnline()).toBe(true);

    // Errors while already offline are ignored; a connectivity loss resets the back-off.
    modeSwitch.setConnectivity(false);
    modeSwitch.reportError('style');
    modeSwitch.setConnectivity(true);
    time.advance(OFFLINE_SWITCH_STABLE_MS);
    expect(modeSwitch.isOnline()).toBe(true);
  });

  it('stops its timer on dispose and resumes it on the next connectivity report', () => {
    const time = clock();
    const modeSwitch = new OfflineModeSwitch(false, time);
    modeSwitch.setConnectivity(true);
    expect(time.pending()).toBe(1);
    modeSwitch.dispose();
    expect(time.pending()).toBe(0);
    modeSwitch.setConnectivity(true);
    time.advance(OFFLINE_SWITCH_STABLE_MS);
    expect(modeSwitch.isOnline()).toBe(true);
  });
});
