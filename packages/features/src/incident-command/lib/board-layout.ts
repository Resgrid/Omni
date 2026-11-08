/**
 * Command board layout math (pure, so the tablet, laptop and desktop cases are testable without a screen). The board
 * measures the width it is given; these turn that width into lane columns, resource columns inside a lane, the card
 * grid's column count and where a lane pager scrolls.
 */

/** Narrowest a lane column gets: a resource row keeps its icon, name, warning badge and view button. */
export const LANE_MIN_WIDTH = 260;

/** Space between lane columns. */
export const LANE_GAP = 8;

/** Shortest a lane column gets, so an empty lane is still a drop target with room for a few resources. */
export const LANE_MIN_HEIGHT = 200;

/** How much of the next lane shows when lanes run off the edge (a cut-off lane says there is more that way). */
export const LANE_PEEK = 0.35;

/** Width of each side's scroll strip (button plus its gap) when lanes run off the edge. */
export const LANE_GUTTER = 36;

/** Narrowest a resource card inside a wide lane gets before the lane drops a column of resources. */
export const LANE_RESOURCE_MIN_WIDTH = 220;

/** Space between resource cards inside a lane. */
export const LANE_RESOURCE_GAP = 6;

/** Most resource columns a lane shows, however wide it is. */
export const LANE_RESOURCE_MAX_COLUMNS = 4;

/** A lane's horizontal padding and borders (10 each side plus the 4pt colour stripe). */
const LANE_CHROME = 24;

/** Board width (inside the screen's padding) from which lanes sit side by side instead of stacking. */
export const BOARD_COLUMNS_MIN_WIDTH = 560;

/** Board width from which the section cards sit two to a row. */
export const BOARD_GRID_TWO_COLUMN_MIN_WIDTH = 720;

/** How tall the incident log card's list gets before it scrolls inside the card. */
export const BOARD_LOG_MAX_HEIGHT = 360;

/** How many recent log entries the board's scrolling log holds (the full log screen has the rest, with search). */
export const BOARD_LOG_LIMIT = 50;

export interface LaneColumnLayout {
  /** Width of every lane column (the unassigned pool included). */
  laneWidth: number;
  /** Lanes run past the edge: show the scroll strips and let the next lane peek in. */
  overflows: boolean;
  /** Width the lanes scroll in (the given width, less both strips when they overflow). */
  viewportWidth: number;
}

/**
 * Lane columns for `count` lanes (the pool included) in `availableWidth`. Lanes that fit at their minimum share the whole
 * width; more than that keep as many whole lanes in view as fit and let the next one peek in beside the scroll strips.
 */
export function laneColumnLayout(availableWidth: number, count: number): LaneColumnLayout {
  const width = Math.max(0, availableWidth);

  if (count <= 0 || width <= 0) return { laneWidth: LANE_MIN_WIDTH, overflows: false, viewportWidth: width };

  const fitWidth = (width - (count - 1) * LANE_GAP) / count;

  if (fitWidth >= LANE_MIN_WIDTH) return { laneWidth: Math.floor(fitWidth), overflows: false, viewportWidth: width };

  const viewportWidth = Math.max(LANE_MIN_WIDTH, width - 2 * LANE_GUTTER);
  // Whole lanes in view: the largest k with k lanes, their gaps and the peek of the next one at no less than the minimum.
  const whole = Math.max(1, Math.floor((viewportWidth - LANE_PEEK * LANE_MIN_WIDTH) / (LANE_MIN_WIDTH + LANE_GAP)));
  const laneWidth = Math.max(LANE_MIN_WIDTH, Math.floor((viewportWidth - whole * LANE_GAP) / (whole + LANE_PEEK)));

  return { laneWidth, overflows: true, viewportWidth };
}

/** Total width of `count` lane columns laid out with `laneColumnLayout`. */
export const laneContentWidth = (laneWidth: number, count: number): number => (count <= 0 ? 0 : count * laneWidth + (count - 1) * LANE_GAP);

/** Resource columns inside a lane `laneWidth` wide: one on a normal lane, more when a few lanes share a wide board. */
export function laneResourceColumns(laneWidth: number): number {
  const inner = laneWidth - LANE_CHROME;
  const columns = Math.floor((inner + LANE_RESOURCE_GAP) / (LANE_RESOURCE_MIN_WIDTH + LANE_RESOURCE_GAP));

  return Math.min(LANE_RESOURCE_MAX_COLUMNS, Math.max(1, columns));
}

export interface LaneScrollMetrics {
  offsetX: number;
  viewportWidth: number;
  contentWidth: number;
}

/**
 * Where a lane pager press scrolls: by the whole lanes in view, landing on a lane's left edge so no lane is left cut
 * off on the left, and never past either end.
 */
export function laneScrollTarget({ offsetX, viewportWidth, contentWidth }: LaneScrollMetrics, laneWidth: number, direction: -1 | 1): number {
  const step = laneWidth + LANE_GAP;
  const maxOffset = Math.max(0, contentWidth - viewportWidth);

  if (step <= 0) return 0;

  const lanesInView = Math.max(1, Math.floor((viewportWidth + LANE_GAP) / step));
  const target = (Math.round(offsetX / step) + direction * lanesInView) * step;

  return Math.min(maxOffset, Math.max(0, target));
}

/** Section card columns on a board `width` wide: two side by side from tablet width up, one on phones and narrow panels. */
export const boardGridColumns = (width: number, isPhone: boolean): 1 | 2 => (!isPhone && width >= BOARD_GRID_TWO_COLUMN_MIN_WIDTH ? 2 : 1);

/** Lanes as columns (tablet, laptop, desktop) or one stacked list (phones and narrow panels). */
export const boardLanesAsColumns = (width: number, isPhone: boolean): boolean => !isPhone && width >= BOARD_COLUMNS_MIN_WIDTH;
