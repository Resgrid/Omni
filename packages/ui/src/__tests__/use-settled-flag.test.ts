import { act, renderHook } from '@testing-library/react-native';

import { useSettledFlag } from '../use-settled-flag';

describe('useSettledFlag', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const advance = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  };

  it('turns on only after the state has held for the delay, and off at once', async () => {
    const { result, rerender } = await renderHook(({ active }: { active: boolean }) => useSettledFlag(active, { delayMs: 1000 }), { initialProps: { active: true } });
    expect(result.current).toBe(false);

    await advance(999);
    expect(result.current).toBe(false);

    await advance(1);
    expect(result.current).toBe(true);

    await rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it('never turns on for a state that ends inside the delay, and restarts the delay when it comes back', async () => {
    const { result, rerender } = await renderHook(({ active }: { active: boolean }) => useSettledFlag(active, { delayMs: 1000 }), { initialProps: { active: true } });
    await advance(800);
    await rerender({ active: false });
    await rerender({ active: true });
    await advance(800);
    expect(result.current).toBe(false);

    await advance(200);
    expect(result.current).toBe(true);
  });

  it('once on, stays at least the minimum time so it never blinks', async () => {
    const { result, rerender } = await renderHook(({ active }: { active: boolean }) => useSettledFlag(active, { delayMs: 1000, minVisibleMs: 1500 }), { initialProps: { active: true } });
    await advance(1000);
    expect(result.current).toBe(true);

    await advance(500);
    await rerender({ active: false });
    expect(result.current).toBe(true);

    await advance(999);
    expect(result.current).toBe(true);

    await advance(1);
    expect(result.current).toBe(false);
  });
});
