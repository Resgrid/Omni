import { createTapPriority } from '../lib/tap-priority';

const nextMacrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('tap priority (pin over shape on the same tap)', () => {
  it('opens a shape when no pin took the tap', async () => {
    const priority = createTapPriority();
    const open = jest.fn();
    priority.whenUnclaimed(open);
    expect(open).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('keeps the pin when its handler runs after the shape’s (web: shapes added first)', async () => {
    const priority = createTapPriority();
    const open = jest.fn();
    priority.whenUnclaimed(open);
    priority.claimForPin();
    await nextMacrotask();
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps the pin when its handler runs first', async () => {
    const priority = createTapPriority();
    const open = jest.fn();
    priority.claimForPin();
    priority.whenUnclaimed(open);
    await nextMacrotask();
    expect(open).not.toHaveBeenCalled();
  });

  it('lets a later tap on a shape through once the pin’s tap is over', async () => {
    const priority = createTapPriority();
    const open = jest.fn();
    priority.claimForPin();
    await nextMacrotask();
    priority.whenUnclaimed(open);
    await Promise.resolve();
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('tap priority for lookups that answer later', () => {
  it('looks up after the tap and opens the answer', async () => {
    const priority = createTapPriority();
    const lookup = jest.fn(async () => 'Stage A');
    const open = jest.fn();
    priority.whenUnclaimedAsync(lookup, open);
    expect(lookup).not.toHaveBeenCalled();
    await nextMacrotask();
    expect(open).toHaveBeenCalledWith('Stage A');
  });

  it('does not look up when a pin took the same tap', async () => {
    const priority = createTapPriority();
    const lookup = jest.fn(async () => 'Stage A');
    priority.whenUnclaimedAsync(lookup, jest.fn());
    priority.claimForPin();
    await nextMacrotask();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('drops an answer that arrives after a pin was pressed', async () => {
    const priority = createTapPriority();
    let answer: (value: string) => void = () => undefined;
    const open = jest.fn();
    priority.whenUnclaimedAsync(() => new Promise<string>((resolve) => (answer = resolve)), open);
    await nextMacrotask();
    priority.claimForPin();
    answer('Stage A');
    await nextMacrotask();
    expect(open).not.toHaveBeenCalled();
  });

  it('opens nothing when the lookup fails', async () => {
    const priority = createTapPriority();
    const open = jest.fn();
    priority.whenUnclaimedAsync(() => Promise.reject(new Error('style mid-swap')), open);
    await nextMacrotask();
    expect(open).not.toHaveBeenCalled();
  });
});
