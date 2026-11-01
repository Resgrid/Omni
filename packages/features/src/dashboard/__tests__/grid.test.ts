import {
  canPlace,
  clampSize,
  computeGridConfig,
  dragSize,
  dropCell,
  findFirstFreeSlot,
  gridPixelHeight,
  type LayoutItem,
  layoutRows,
  layoutWidgets,
  moveItem,
  packItems,
  rectsOverlap,
  rectToFrame,
  reorderItems,
  resizeItem,
} from '../lib/grid';

const item = (id: string, x: number, y: number, w = 1, h = 1): LayoutItem => ({ id, x, y, w, h });

describe('computeGridConfig', () => {
  it('derives columns and limits from width and form factor (phone → wall)', () => {
    const phone = computeGridConfig(390, 'phone');
    expect(phone.numColumns).toBe(2);
    expect(phone.sizeClass).toBe('compact');
    expect(phone.maxWidgetHeight).toBe(4);
    expect(phone.cellWidth).toBeCloseTo((390 - 16) / 2);

    const tablet = computeGridConfig(1024, 'tablet');
    expect(tablet.numColumns).toBe(Math.floor((1024 - 16) / 140));
    expect(tablet.maxWidgetHeight).toBe(6);

    const desktop = computeGridConfig(1440, 'desktop');
    expect(desktop.numColumns).toBe(Math.floor((1440 - 16) / 120));
    expect(desktop.sizeClass).toBe('large');
    expect(desktop.maxWidgetHeight).toBe(10);

    const wall = computeGridConfig(3840, 'wall');
    expect(wall.numColumns).toBe(Math.floor((3840 - 16) / 100));
    expect(wall.cellHeight).toBe(100);
    expect(wall.maxWidgetHeight).toBe(12);
    expect(wall.maxWidgetWidth).toBe(wall.numColumns);
  });

  it('always keeps two columns, even before the container is measured', () => {
    const unmeasured = computeGridConfig(0, 'phone');
    expect(unmeasured.numColumns).toBe(2);
    expect(unmeasured.cellWidth).toBeGreaterThan(0);
    expect(computeGridConfig(Number.NaN, 'phone').numColumns).toBe(2);
  });
});

describe('geometry helpers', () => {
  it('detects overlaps and placement inside the columns', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 1, h: 1 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 1, h: 1 })).toBe(false);
    expect(canPlace({ x: 3, y: 0, w: 2, h: 1 }, [], 4)).toBe(false);
    expect(canPlace({ x: -1, y: 0, w: 1, h: 1 }, [], 4)).toBe(false);
    expect(canPlace({ x: 2, y: 0, w: 2, h: 1 }, [{ x: 0, y: 0, w: 2, h: 1 }], 4)).toBe(true);
  });

  it('clamps sizes to the grid limits and at least 1×1', () => {
    expect(clampSize({ w: 9, h: 0 }, { maxWidgetWidth: 4, maxWidgetHeight: 6 })).toEqual({ w: 4, h: 1 });
    expect(clampSize({ w: Number.NaN, h: 2.6 }, { maxWidgetWidth: 4, maxWidgetHeight: 6 })).toEqual({ w: 1, h: 3 });
  });

  it('finds the first free slot row by row', () => {
    expect(findFirstFreeSlot([], { w: 2, h: 1 }, 4)).toEqual({ x: 0, y: 0 });
    expect(findFirstFreeSlot([{ x: 0, y: 0, w: 2, h: 1 }], { w: 2, h: 1 }, 4)).toEqual({ x: 2, y: 0 });
    expect(findFirstFreeSlot([{ x: 0, y: 0, w: 3, h: 2 }], { w: 2, h: 1 }, 4)).toEqual({ x: 0, y: 2 });
  });

  it('turns cells into pixel frames and pixel height', () => {
    const config = { cellWidth: 100, cellHeight: 120, gridPadding: 8 };
    expect(rectToFrame({ x: 1, y: 2, w: 2, h: 1 }, config)).toEqual({ left: 108, top: 248, width: 200, height: 120 });
    const layout = layoutWidgets([item('a', 0, 0, 1, 2), item('b', 1, 1, 1, 2)], 4);
    expect(layoutRows(layout)).toBe(3);
    expect(gridPixelHeight(layout, config)).toBe(3 * 120 + 16);
  });
});

describe('layoutWidgets', () => {
  it('keeps stored cells and moves later widgets that collide to the first free cell', () => {
    const layout = layoutWidgets([item('a', 0, 0, 2, 2), item('b', 1, 1), item('c', 3, 0)], 4);
    expect(layout.get('a')).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    expect(layout.get('b')).toEqual({ x: 2, y: 0, w: 1, h: 1 });
    expect(layout.get('c')).toEqual({ x: 3, y: 0, w: 1, h: 1 });
  });

  it('places unset positions (-1) automatically', () => {
    const layout = layoutWidgets([item('a', -1, -1, 2, 1), item('b', -1, -1, 2, 1), item('c', -1, -1, 1, 1)], 4);
    expect(layout.get('a')).toEqual({ x: 0, y: 0, w: 2, h: 1 });
    expect(layout.get('b')).toEqual({ x: 2, y: 0, w: 2, h: 1 });
    expect(layout.get('c')).toEqual({ x: 0, y: 1, w: 1, h: 1 });
  });

  it('narrows wide widgets on a small grid without touching the stored values', () => {
    const items = [item('wide', 6, 0, 5, 2)];
    const layout = layoutWidgets(items, 2);
    expect(layout.get('wide')).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    expect(items[0]).toEqual(item('wide', 6, 0, 5, 2));
    // Widening again restores the stored place.
    expect(layoutWidgets(items, 12).get('wide')).toEqual({ x: 6, y: 0, w: 5, h: 2 });
  });
});

describe('moveItem / resizeItem', () => {
  const items = [item('a', 0, 0, 2, 1), item('b', 2, 0, 1, 1)];
  const layout = layoutWidgets(items, 4);

  it('moves to a free cell and pins every other widget where it is shown', () => {
    const next = moveItem(items, layout, 'b', { x: 0, y: 1 }, 4);
    expect(next).toEqual([item('a', 0, 0, 2, 1), item('b', 0, 1, 1, 1)]);
  });

  it('refuses a drop onto another widget, an unknown id or the same cell', () => {
    expect(moveItem(items, layout, 'b', { x: 1, y: 0 }, 4)).toBeNull();
    expect(moveItem(items, layout, 'zz', { x: 3, y: 3 }, 4)).toBeNull();
    expect(moveItem(items, layout, 'b', { x: 2, y: 0 }, 4)).toBeNull();
  });

  it('resizes only when the new size fits in place', () => {
    expect(resizeItem(items, layout, 'b', { w: 2, h: 2 }, 4)).toEqual([item('a', 0, 0, 2, 1), item('b', 2, 0, 2, 2)]);
    expect(resizeItem(items, layout, 'a', { w: 3, h: 1 }, 4)).toBeNull();
    expect(resizeItem(items, layout, 'a', { w: 2, h: 1 }, 4)).toBeNull();
  });
});

describe('packItems / reorderItems', () => {
  it('re-packs in list order from the top', () => {
    const packed = packItems([item('a', 3, 5, 2, 1), item('b', 0, 9, 2, 1), item('c', 1, 1, 4, 1)], 4);
    expect(packed.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 2, y: 0 },
      { id: 'c', x: 0, y: 1 },
    ]);
  });

  it('moves an item one place and refuses to go past either end', () => {
    const items = [item('a', 0, 0), item('b', 1, 0), item('c', 2, 0)];
    expect(reorderItems(items, 'c', -1)?.map((entry) => entry.id)).toEqual(['a', 'c', 'b']);
    expect(reorderItems(items, 'a', -1)).toBeNull();
    expect(reorderItems(items, 'c', 1)).toBeNull();
  });
});

describe('drag maths', () => {
  const config = { cellWidth: 100, cellHeight: 100, numColumns: 4, maxWidgetWidth: 4, maxWidgetHeight: 6 };

  it('snaps a drop to the nearest cell inside the columns', () => {
    expect(dropCell({ x: 0, y: 0, w: 2, h: 1 }, 160, 40, config)).toEqual({ x: 2, y: 0 });
    expect(dropCell({ x: 0, y: 0, w: 2, h: 1 }, 900, -300, config)).toEqual({ x: 2, y: 0 });
    expect(dropCell({ x: 1, y: 3, w: 1, h: 1 }, Number.NaN, 140, config)).toEqual({ x: 1, y: 4 });
  });

  it('turns a resize drag into a clamped size', () => {
    expect(dragSize({ x: 0, y: 0, w: 1, h: 1 }, 160, 260, config)).toEqual({ w: 3, h: 4 });
    expect(dragSize({ x: 0, y: 0, w: 2, h: 2 }, -500, 2000, config)).toEqual({ w: 1, h: 6 });
  });
});
