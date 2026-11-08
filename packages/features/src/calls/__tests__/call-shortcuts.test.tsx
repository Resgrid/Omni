import './test-setup';

import { renderHook } from '@testing-library/react-native';

import { useCallShortcuts } from '../hooks/use-call-shortcuts.web';

interface FakeKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  target: null;
  preventDefault: () => void;
}

const press = (key: string, modifiers: Partial<Pick<FakeKey, 'ctrlKey' | 'metaKey'>> = {}): FakeKey => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  defaultPrevented: false,
  target: null,
  preventDefault: jest.fn(),
  ...modifiers,
});

// The features tests run in React Native's environment (window is the global object, without DOM APIs): the web hook gets
// a window that keeps its key listeners and a document that answers whether a pop-up (an `aria-modal` dialog) is open.
const listeners = new Set<(event: FakeKey) => void>();
let openPopups = 0;

const keyDown = (event: FakeKey) => listeners.forEach((listener) => listener(event));

beforeAll(() => {
  Object.defineProperty(globalThis, 'addEventListener', { configurable: true, value: (_type: string, listener: (event: FakeKey) => void) => listeners.add(listener) });
  Object.defineProperty(globalThis, 'removeEventListener', { configurable: true, value: (_type: string, listener: (event: FakeKey) => void) => listeners.delete(listener) });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: (selector: string) => (selector === '[aria-modal="true"]' && openPopups > 0 ? {} : null) } });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class FakeHTMLElement {} });
});

afterAll(() => {
  for (const name of ['addEventListener', 'removeEventListener', 'document', 'HTMLElement']) Reflect.deleteProperty(globalThis, name);
});

beforeEach(() => {
  listeners.clear();
  openPopups = 0;
});

const renderShortcuts = async () => {
  const handlers = { onBack: jest.fn(), onEdit: jest.fn(), onTab: jest.fn() };
  await renderHook(() => useCallShortcuts(handlers));

  return handlers;
};

describe('call screen shortcuts (web)', () => {
  it('goes back on Escape, edits on Ctrl/Cmd+E and switches tabs on digits', async () => {
    const handlers = await renderShortcuts();

    keyDown(press('Escape'));
    keyDown(press('e', { metaKey: true }));
    keyDown(press('2'));

    expect(handlers.onBack).toHaveBeenCalledTimes(1);
    expect(handlers.onEdit).toHaveBeenCalledTimes(1);
    expect(handlers.onTab).toHaveBeenCalledWith(1);
  });

  it('leaves the keyboard to a pop-up open over the screen, such as the call summary or the Set Active status sheet', async () => {
    const handlers = await renderShortcuts();
    openPopups = 1;

    keyDown(press('Escape'));
    keyDown(press('e', { ctrlKey: true }));
    keyDown(press('3'));

    expect(handlers.onBack).not.toHaveBeenCalled();
    expect(handlers.onEdit).not.toHaveBeenCalled();
    expect(handlers.onTab).not.toHaveBeenCalled();

    openPopups = 0;
    keyDown(press('Escape'));
    expect(handlers.onBack).toHaveBeenCalledTimes(1);
  });
});
