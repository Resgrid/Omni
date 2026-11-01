import type { FormFactor } from '@resgrid/ui';

import type { GridSizeClass, WidgetSize } from './widget-types';

/**
 * Pure grid math for the dashboard (omni-plan §7.11: a custom grid on gesture-handler + reanimated replaces
 * react-native-draggable-grid). Widgets keep their own cell position (x, y) and size (w, h) in grid units; the layout is
 * resolved at render time, so a narrow window never rewrites the stored positions — widening it again restores them.
 */

export const GRID_PADDING = 8;
/** Space between two widgets (each widget is inset by half of it). */
export const WIDGET_GAP = 10;

export interface GridConfig {
  /** Window (or container) width the grid was computed for. */
  width: number;
  numColumns: number;
  /** Width of one column: the available width shared evenly, so the grid always fills the screen. */
  cellWidth: number;
  /** Height of one row (the legacy base unit). */
  cellHeight: number;
  gridPadding: number;
  maxWidgetWidth: number;
  maxWidgetHeight: number;
  sizeClass: GridSizeClass;
}

export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutItem extends GridRect {
  id: string;
}

/** Base unit and height limit by window width (BigBoard `use-grid-config`): wall boards get more, smaller cells. */
const baseUnitFor = (width: number): number => (width > 1920 ? 100 : width > 1024 ? 120 : 140);
const maxHeightFor = (width: number): number => (width > 1920 ? 12 : width > 1024 ? 10 : width >= 600 ? 6 : 4);

/** The grid for a width and form factor. Always at least two columns, so a phone still shows a usable board. */
export function computeGridConfig(width: number, formFactor: FormFactor): GridConfig {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
  const baseUnit = baseUnitFor(safeWidth);
  const available = Math.max(0, safeWidth - GRID_PADDING * 2);
  const numColumns = Math.max(2, Math.floor(available / baseUnit));
  return {
    width: safeWidth,
    numColumns,
    cellWidth: available > 0 ? available / numColumns : baseUnit,
    cellHeight: baseUnit,
    gridPadding: GRID_PADDING,
    maxWidgetWidth: numColumns,
    maxWidgetHeight: maxHeightFor(safeWidth),
    sizeClass: formFactor === 'desktop' || formFactor === 'wall' ? 'large' : 'compact',
  };
}

const toInt = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback);

/** A stored size clamped to what the grid can show (at least 1×1). */
export function clampSize(size: Partial<WidgetSize>, limits: Pick<GridConfig, 'maxWidgetWidth' | 'maxWidgetHeight'>): WidgetSize {
  return {
    w: Math.max(1, Math.min(toInt(size.w, 1), Math.max(1, limits.maxWidgetWidth))),
    h: Math.max(1, Math.min(toInt(size.h, 1), Math.max(1, limits.maxWidgetHeight))),
  };
}

export const rectsOverlap = (a: GridRect, b: GridRect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** True when `rect` lies inside the columns and overlaps none of `others`. */
export function canPlace(rect: GridRect, others: readonly GridRect[], numColumns: number): boolean {
  if (rect.x < 0 || rect.y < 0 || rect.w < 1 || rect.h < 1 || rect.x + rect.w > numColumns) return false;
  return !others.some((other) => rectsOverlap(rect, other));
}

/** The first free cell (row by row, left to right) for a w×h widget. */
export function findFirstFreeSlot(occupied: readonly GridRect[], size: WidgetSize, numColumns: number): { x: number; y: number } {
  const w = Math.min(size.w, numColumns);
  const maxRow = occupied.reduce((max, rect) => Math.max(max, rect.y + rect.h), 0);
  for (let y = 0; y <= maxRow; y++) {
    for (let x = 0; x + w <= numColumns; x++) {
      if (canPlace({ x, y, w, h: size.h }, occupied, numColumns)) return { x, y };
    }
  }
  return { x: 0, y: maxRow };
}

/**
 * Resolves where every widget sits for a column count. In list order, a widget keeps its stored cell when that cell is
 * inside the grid and free; otherwise it takes the first free cell. Wider-than-grid widgets are narrowed. Never mutates.
 */
export function layoutWidgets(items: readonly LayoutItem[], numColumns: number): Map<string, GridRect> {
  const placed = new Map<string, GridRect>();
  const occupied: GridRect[] = [];
  for (const item of items) {
    const w = Math.max(1, Math.min(toInt(item.w, 1), numColumns));
    const h = Math.max(1, toInt(item.h, 1));
    const stored = { x: toInt(item.x, -1), y: toInt(item.y, -1), w, h };
    const rect = canPlace(stored, occupied, numColumns) ? stored : { ...findFirstFreeSlot(occupied, { w, h }, numColumns), w, h };
    placed.set(item.id, rect);
    occupied.push(rect);
  }
  return placed;
}

/** Rows the resolved layout uses. */
export const layoutRows = (layout: ReadonlyMap<string, GridRect>): number => Array.from(layout.values()).reduce((max, rect) => Math.max(max, rect.y + rect.h), 0);

/** Pixel height of the grid content (rows plus padding). */
export const gridPixelHeight = (layout: ReadonlyMap<string, GridRect>, config: Pick<GridConfig, 'cellHeight' | 'gridPadding'>): number => layoutRows(layout) * config.cellHeight + config.gridPadding * 2;

/** Pixel frame of a widget inside the grid (the gap is applied by the widget's own inset). */
export const rectToFrame = (rect: GridRect, config: Pick<GridConfig, 'cellWidth' | 'cellHeight' | 'gridPadding'>): { left: number; top: number; width: number; height: number } => ({
  left: config.gridPadding + rect.x * config.cellWidth,
  top: config.gridPadding + rect.y * config.cellHeight,
  width: rect.w * config.cellWidth,
  height: rect.h * config.cellHeight,
});

/** The cell a dragged widget lands on: the nearest cell to where it was dropped, kept inside the columns. */
export function dropCell(rect: GridRect, translationX: number, translationY: number, config: Pick<GridConfig, 'cellWidth' | 'cellHeight' | 'numColumns'>): { x: number; y: number } {
  const dx = Number.isFinite(translationX) ? translationX : 0;
  const dy = Number.isFinite(translationY) ? translationY : 0;
  const x = Math.round(rect.x + dx / config.cellWidth);
  const y = Math.round(rect.y + dy / config.cellHeight);
  return { x: Math.max(0, Math.min(config.numColumns - rect.w, x)), y: Math.max(0, y) };
}

/** The size a resize-handle drag asks for, clamped to the grid limits. */
export function dragSize(rect: GridRect, translationX: number, translationY: number, config: Pick<GridConfig, 'cellWidth' | 'cellHeight' | 'maxWidgetWidth' | 'maxWidgetHeight'>): WidgetSize {
  const dx = Number.isFinite(translationX) ? translationX : 0;
  const dy = Number.isFinite(translationY) ? translationY : 0;
  return clampSize({ w: rect.w + Math.round(dx / config.cellWidth), h: rect.h + Math.round(dy / config.cellHeight) }, config);
}

const othersOf = (layout: ReadonlyMap<string, GridRect>, id: string): GridRect[] => Array.from(layout.entries()).flatMap(([otherId, rect]) => (otherId === id ? [] : [rect]));

/**
 * Moves a widget to a cell when that cell is free. Returns the updated items, or null when nothing changes (same cell,
 * collision, unknown id) — a drop onto another widget snaps back instead of shuffling the board.
 */
export function moveItem<T extends LayoutItem>(items: readonly T[], layout: ReadonlyMap<string, GridRect>, id: string, target: { x: number; y: number }, numColumns: number): T[] | null {
  const current = layout.get(id);
  if (!current) return null;
  if (current.x === target.x && current.y === target.y) return null;
  const next = { ...current, x: target.x, y: target.y };
  if (!canPlace(next, othersOf(layout, id), numColumns)) return null;
  // Pin every widget at the cell it is shown in, so the move cannot make another widget jump.
  return items.map((item) => {
    const rect = item.id === id ? next : layout.get(item.id);
    return rect ? { ...item, x: rect.x, y: rect.y } : item;
  });
}

/** Resizes a widget when the new size fits where it is. Returns the updated items, or null when it does not fit or nothing changes. */
export function resizeItem<T extends LayoutItem>(items: readonly T[], layout: ReadonlyMap<string, GridRect>, id: string, size: WidgetSize, numColumns: number): T[] | null {
  const current = layout.get(id);
  if (!current) return null;
  if (current.w === size.w && current.h === size.h) return null;
  const next = { ...current, w: size.w, h: size.h };
  if (!canPlace(next, othersOf(layout, id), numColumns)) return null;
  return items.map((item) => {
    const rect = layout.get(item.id);
    if (item.id === id) return { ...item, x: next.x, y: next.y, w: size.w, h: size.h };
    return rect ? { ...item, x: rect.x, y: rect.y } : item;
  });
}

/** Re-packs every widget from the top in list order (Configure → reorder / auto-arrange). */
export function packItems<T extends LayoutItem>(items: readonly T[], numColumns: number): T[] {
  const occupied: GridRect[] = [];
  return items.map((item) => {
    const w = Math.max(1, Math.min(toInt(item.w, 1), numColumns));
    const h = Math.max(1, toInt(item.h, 1));
    const slot = findFirstFreeSlot(occupied, { w, h }, numColumns);
    occupied.push({ ...slot, w, h });
    return { ...item, x: slot.x, y: slot.y };
  });
}

/** Moves an item one place earlier (-1) or later (+1) in the list. Returns null at either end. */
export function reorderItems<T extends LayoutItem>(items: readonly T[], id: string, direction: -1 | 1): T[] | null {
  const index = items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return null;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as T);
  return next;
}
