import { act, renderHook } from '@testing-library/react-native';

import { DEFAULT_TOAST_DURATION_MS, removeToast, showToast, useToastStore } from '../store';
import { useToast } from '../use-toast';

describe('toast store (IC API)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useToastStore.getState().clearToasts();
    useToastStore.setState({ modalHosts: [] });
  });

  afterEach(() => {
    useToastStore.getState().clearToasts();
    jest.useRealTimers();
  });

  it('returns a unique id for every toast and queues them in order', () => {
    const first = showToast('info', 'One');
    const second = showToast('success', 'Two', 'Title');

    expect(first).not.toBe(second);
    expect(useToastStore.getState().toasts.map((toast) => [toast.id, toast.type, toast.message, toast.title])).toEqual([
      [first, 'info', 'One', undefined],
      [second, 'success', 'Two', 'Title'],
    ]);
  });

  it('automatically removes a toast after the default duration', () => {
    showToast('success', 'Saved');

    jest.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS - 1);
    expect(useToastStore.getState().toasts).toHaveLength(1);

    jest.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('honours a custom duration per toast', () => {
    showToast('success', 'Saved', undefined, { duration: 1000 });
    showToast('info', 'Longer', undefined, { duration: 5000 });

    jest.advanceTimersByTime(1000);
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual(['Longer']);
  });

  it('keeps a toast with duration 0 until it is dismissed', () => {
    const id = showToast('warning', 'Sticky', undefined, { duration: 0 });

    jest.advanceTimersByTime(60_000);
    expect(useToastStore.getState().toasts).toHaveLength(1);

    removeToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('cancels auto-dismiss when a toast is removed manually', () => {
    const listener = jest.fn();
    const unsubscribe = useToastStore.subscribe(listener);
    const id = showToast('info', 'Test message', undefined, { duration: 3000 });

    removeToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(3000);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
    unsubscribe();
  });

  it('stores the onPress action with the toast', () => {
    const onPress = jest.fn();
    showToast('info', 'View queue', undefined, { onPress });

    expect(useToastStore.getState().toasts[0].onPress).toBe(onPress);
  });

  it('clears every toast and its timer', () => {
    showToast('info', 'a');
    showToast('info', 'b');

    useToastStore.getState().clearToasts();

    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('registers modal hosts once and in opening order', () => {
    const { registerModalHost, unregisterModalHost } = useToastStore.getState();
    registerModalHost('a');
    registerModalHost('b');
    registerModalHost('a');

    expect(useToastStore.getState().modalHosts).toEqual(['a', 'b']);
    unregisterModalHost('a');
    expect(useToastStore.getState().modalHosts).toEqual(['b']);
  });
});

describe('useToast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useToastStore.getState().clearToasts();
  });

  afterEach(() => {
    useToastStore.getState().clearToasts();
    jest.useRealTimers();
  });

  it('exposes typed helpers that return the toast id', () => {
    const { result } = renderHook(() => useToast());
    let id = '';

    act(() => {
      id = result.current.error('Failed', 'Error', { duration: 4000 });
      result.current.success('Saved');
      result.current.warning('Careful');
      result.current.info('FYI');
    });

    expect(useToastStore.getState().toasts.map((toast) => toast.type)).toEqual(['error', 'success', 'warning', 'info']);

    act(() => result.current.dismiss(id));
    expect(useToastStore.getState().toasts.map((toast) => toast.type)).toEqual(['success', 'warning', 'info']);
  });

  it('is referentially stable across renders', () => {
    const { result, rerender } = renderHook(() => useToast());
    const first = result.current;

    rerender({});

    expect(result.current).toBe(first);
  });
});
