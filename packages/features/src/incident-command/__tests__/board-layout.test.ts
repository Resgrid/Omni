import {
  BOARD_GRID_TWO_COLUMN_MIN_WIDTH,
  boardGridColumns,
  boardLanesAsColumns,
  LANE_GAP,
  LANE_GUTTER,
  LANE_MIN_WIDTH,
  LANE_PEEK,
  laneColumnLayout,
  laneContentWidth,
  laneResourceColumns,
  laneScrollTarget,
} from '../lib/board-layout';

describe('laneColumnLayout', () => {
  it('shares the whole width between lanes that fit, so a few lanes fill a laptop or desktop board', () => {
    // A 1366 laptop board (pool + 3 lanes) and a 1920 desktop board (pool + 2 lanes).
    expect(laneColumnLayout(1300, 4)).toEqual({ laneWidth: 319, overflows: false, viewportWidth: 1300 });
    expect(laneColumnLayout(1850, 3)).toEqual({ laneWidth: 611, overflows: false, viewportWidth: 1850 });
    expect(laneContentWidth(319, 4)).toBeLessThanOrEqual(1300);
  });

  it('gives the pool alone the full width', () => {
    expect(laneColumnLayout(700, 1)).toEqual({ laneWidth: 700, overflows: false, viewportWidth: 700 });
  });

  it('keeps whole lanes in view and lets the next one peek in when lanes do not fit', () => {
    // A portrait iPad board: pool + 4 lanes in 718pt.
    const layout = laneColumnLayout(718, 5);
    expect(layout.overflows).toBe(true);
    expect(layout.viewportWidth).toBe(718 - 2 * LANE_GUTTER);
    expect(layout.laneWidth).toBeGreaterThanOrEqual(LANE_MIN_WIDTH);

    const step = layout.laneWidth + LANE_GAP;
    const whole = Math.floor(layout.viewportWidth / step);
    const peek = layout.viewportWidth - whole * step;
    expect(whole).toBe(2);
    // About LANE_PEEK of the next lane shows: enough to read as cut off, never most of it.
    expect(peek / layout.laneWidth).toBeCloseTo(LANE_PEEK, 1);
    expect(laneContentWidth(layout.laneWidth, 5)).toBeGreaterThan(layout.viewportWidth);
  });

  it('never squeezes a lane below its minimum on a narrow pane', () => {
    const layout = laneColumnLayout(400, 3);
    expect(layout.overflows).toBe(true);
    expect(layout.laneWidth).toBeGreaterThanOrEqual(LANE_MIN_WIDTH);
  });

  it('falls back to the minimum width before the row is measured', () => {
    expect(laneColumnLayout(0, 3)).toEqual({ laneWidth: LANE_MIN_WIDTH, overflows: false, viewportWidth: 0 });
  });
});

describe('laneResourceColumns', () => {
  it('tiles resources across a wide lane, up to four', () => {
    expect(laneResourceColumns(LANE_MIN_WIDTH)).toBe(1);
    expect(laneResourceColumns(319)).toBe(1);
    expect(laneResourceColumns(611)).toBe(2);
    expect(laneResourceColumns(800)).toBe(3);
    expect(laneResourceColumns(1850)).toBe(4);
  });
});

describe('laneScrollTarget', () => {
  // Lanes 300 wide (308 a step) in a 700 viewport: two whole lanes in view, 7 lanes in all.
  const content = laneContentWidth(300, 7);

  it('pages by the whole lanes in view and lands on a lane edge', () => {
    expect(laneScrollTarget({ offsetX: 0, viewportWidth: 700, contentWidth: content }, 300, 1)).toBe(616);
    // Part-way (a swipe stopped mid-lane) snaps to the nearest lane before paging.
    expect(laneScrollTarget({ offsetX: 320, viewportWidth: 700, contentWidth: content }, 300, 1)).toBe(924);
    expect(laneScrollTarget({ offsetX: 924, viewportWidth: 700, contentWidth: content }, 300, -1)).toBe(308);
  });

  it('stops at either end', () => {
    expect(laneScrollTarget({ offsetX: 1200, viewportWidth: 700, contentWidth: content }, 300, 1)).toBe(content - 700);
    expect(laneScrollTarget({ offsetX: 100, viewportWidth: 700, contentWidth: content }, 300, -1)).toBe(0);
  });
});

describe('board columns', () => {
  it('puts section cards two to a row from tablet width up, one on phones', () => {
    expect(boardGridColumns(BOARD_GRID_TWO_COLUMN_MIN_WIDTH, false)).toBe(2);
    expect(boardGridColumns(BOARD_GRID_TWO_COLUMN_MIN_WIDTH - 1, false)).toBe(1);
    expect(boardGridColumns(1600, true)).toBe(1);
  });

  it('lays lanes out as columns on tablets and up, stacked on phones and narrow panes', () => {
    expect(boardLanesAsColumns(744, false)).toBe(true);
    expect(boardLanesAsColumns(500, false)).toBe(false);
    expect(boardLanesAsColumns(800, true)).toBe(false);
  });
});
