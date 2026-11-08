import { attachWheelScroll, getWheelScrollLeft, type WheelInput, type WheelScrollNode } from '../wheel-scroll.web';

// A 200-wide strip over a 600-wide row: it scrolls from 0 to 400.
const strip = (scrollLeft: number) => ({ scrollLeft, scrollWidth: 600, clientWidth: 200 });

const turn = (deltaY: number, deltaX = 0, deltaMode = 0) => ({ deltaX, deltaY, deltaMode });

describe('getWheelScrollLeft', () => {
  it('turns an up/down wheel into a sideways scroll, stopping at either end', () => {
    expect(getWheelScrollLeft(strip(0), turn(100))).toBe(100);
    expect(getWheelScrollLeft(strip(350), turn(100))).toBe(400);
    expect(getWheelScrollLeft(strip(100), turn(-100))).toBe(0);
  });

  it('counts a wheel that reports lines or pages in pixels', () => {
    expect(getWheelScrollLeft(strip(0), turn(3, 0, 1))).toBe(48);
    expect(getWheelScrollLeft(strip(0), turn(1, 0, 2))).toBe(200);
  });

  it('leaves the turn to the browser for a sideways gesture, a row that fits and a row already at that end', () => {
    expect(getWheelScrollLeft(strip(0), turn(20, 40))).toBeNull();
    expect(getWheelScrollLeft(strip(0), turn(0))).toBeNull();
    expect(getWheelScrollLeft({ scrollLeft: 0, scrollWidth: 201, clientWidth: 200 }, turn(100))).toBeNull();
    expect(getWheelScrollLeft(strip(400), turn(100))).toBeNull();
    expect(getWheelScrollLeft(strip(0), turn(-100))).toBeNull();
  });
});

/** The row's DOM node, holding the one wheel listener the helper attaches. */
class FakeRow implements WheelScrollNode {
  readonly scrollWidth = 600;
  readonly clientWidth = 200;
  options: AddEventListenerOptions | null = null;
  private listener: ((event: WheelInput) => void) | null = null;

  constructor(public scrollLeft: number) {}

  addEventListener(_type: 'wheel', listener: (event: WheelInput) => void, options: AddEventListenerOptions): void {
    this.listener = listener;
    this.options = options;
  }

  removeEventListener(_type: 'wheel', listener: (event: WheelInput) => void): void {
    if (this.listener === listener) this.listener = null;
  }

  wheel(deltaY: number, ctrlKey = false): WheelInput {
    const event: WheelInput = {
      deltaX: 0,
      deltaY,
      deltaMode: 0,
      ctrlKey,
      defaultPrevented: false,
      preventDefault: () => {
        event.defaultPrevented = true;
      },
    };

    this.listener?.(event);

    return event;
  }
}

describe('attachWheelScroll', () => {
  it('scrolls the row sideways and keeps the page from scrolling too, until detached', () => {
    const row = new FakeRow(0);
    const detach = attachWheelScroll(row);

    // Not passive: a passive listener cannot stop the page scrolling.
    expect(row.options).toEqual({ passive: false });
    expect(row.wheel(120).defaultPrevented).toBe(true);
    expect(row.scrollLeft).toBe(120);

    detach();
    row.wheel(120);
    expect(row.scrollLeft).toBe(120);
  });

  it('lets the page have a turn the row cannot use, and Ctrl+wheel zoom', () => {
    const row = new FakeRow(400);

    attachWheelScroll(row);

    expect(row.wheel(120).defaultPrevented).toBe(false);
    expect(row.wheel(-120, true).defaultPrevented).toBe(false);
    expect(row.scrollLeft).toBe(400);
  });
});
