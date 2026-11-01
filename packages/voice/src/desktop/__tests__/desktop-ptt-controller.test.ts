import { DesktopPttController, formatHotkey, isEditableTarget, matchesHotkey } from '../desktop-ptt-controller';

type Listener = (event: never) => void;

const makeTarget = () => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    visibilityState: 'visible',
    addEventListener: jest.fn((type: string, listener: Listener) => {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type))?.add(listener);
    }),
    removeEventListener: jest.fn((type: string, listener: Listener) => listeners.get(type)?.delete(listener)),
    dispatch(type: string, event: object = {}) {
      [...(listeners.get(type) ?? [])].forEach((listener) => (listener as (e: object) => void)(event));
    },
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
};

const key = (code: string, extra: object = {}) => ({ code, preventDefault: jest.fn(), ...extra });

describe('DesktopPttController', () => {
  let win: ReturnType<typeof makeTarget>;
  let doc: ReturnType<typeof makeTarget>;
  let onPress: jest.Mock;
  let onRelease: jest.Mock;
  let controller: DesktopPttController;

  beforeEach(() => {
    win = makeTarget();
    doc = makeTarget();
    onPress = jest.fn();
    onRelease = jest.fn();
    controller = new DesktopPttController({ onPress, onRelease });
    controller.attach(win, doc);
  });

  it('transmits while the hotkey is held and releases on key up', () => {
    const down = key('Space');
    win.dispatch('keydown', down);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(controller.isPressed()).toBe(true);
    win.dispatch('keyup', key('Space'));
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(controller.isPressed()).toBe(false);
  });

  it('ignores auto-repeat and other keys', () => {
    win.dispatch('keydown', key('Space'));
    win.dispatch('keydown', key('Space', { repeat: true }));
    win.dispatch('keydown', key('KeyA'));
    win.dispatch('keyup', key('KeyA'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('never keys the radio while typing in a text field', () => {
    win.dispatch('keydown', key('Space', { target: { tagName: 'INPUT', type: 'text' } }));
    win.dispatch('keydown', key('Space', { target: { tagName: 'TEXTAREA' } }));
    win.dispatch('keydown', key('Space', { target: { isContentEditable: true } }));
    expect(onPress).not.toHaveBeenCalled();
    win.dispatch('keydown', key('Space', { target: { tagName: 'INPUT', type: 'checkbox' } }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('releases when the window loses focus while the key is held', () => {
    win.dispatch('keydown', key('Space'));
    win.dispatch('blur');
    expect(onRelease).toHaveBeenCalledTimes(1);
    win.dispatch('keyup', key('Space'));
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('releases when the page is hidden', () => {
    win.dispatch('keydown', key('Space'));
    doc.visibilityState = 'hidden';
    doc.dispatch('visibilitychange');
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('does not key up when disabled (no channel joined)', () => {
    controller.update({ isEnabled: () => false });
    win.dispatch('keydown', key('Space'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('supports a configurable hotkey with modifiers and toggle mode', () => {
    controller.update({ hotkey: { code: 'F13', ctrlKey: true }, mode: 'toggle' });
    win.dispatch('keydown', key('F13'));
    expect(onPress).not.toHaveBeenCalled();
    win.dispatch('keydown', key('F13', { ctrlKey: true }));
    win.dispatch('keyup', key('F13'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRelease).not.toHaveBeenCalled();
    win.dispatch('keydown', key('F13', { ctrlKey: true }));
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('detaches its listeners and releases a held key', () => {
    win.dispatch('keydown', key('Space'));
    const detach = controller.attach(win, doc);
    expect(onRelease).toHaveBeenCalledTimes(1);
    detach();
    expect(win.count('keydown')).toBe(0);
    expect(doc.count('visibilitychange')).toBe(0);
  });
});

describe('hotkey helpers', () => {
  it('matches modifiers exactly and formats labels', () => {
    expect(matchesHotkey({ code: 'Space' }, { code: 'Space' })).toBe(true);
    expect(matchesHotkey({ code: 'Space', shiftKey: true }, { code: 'Space' })).toBe(false);
    expect(formatHotkey({ code: 'KeyT', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Shift+T');
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableTarget(null)).toBe(false);
  });
});
