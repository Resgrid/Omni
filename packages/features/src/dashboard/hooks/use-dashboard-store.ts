import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { findFirstFreeSlot, type GridConfig, type GridRect, layoutWidgets, moveItem, packItems, reorderItems, resizeItem } from '../lib/grid';
import { dashboardStateStorage, registerDashboardStore } from '../lib/storage';
import { defaultWidgetSize, isWidgetType, type WidgetSize, type WidgetType } from '../lib/widget-types';

/** One widget on the board: its type and its cell position and size in grid units. */
export interface DashboardWidget {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
}

type GridLimits = Pick<GridConfig, 'numColumns' | 'sizeClass' | 'maxWidgetWidth' | 'maxWidgetHeight'>;

export interface DashboardLayoutState {
  widgets: DashboardWidget[];
  /** Adds a widget type (one of each per board) at the first free cell. Returns its id, or null when it is already on the board. */
  addWidget: (type: WidgetType, grid: GridLimits) => string | null;
  removeWidget: (id: string) => void;
  /** Moves a widget to a free cell; false when the cell is taken (the widget snaps back). */
  moveWidget: (id: string, cell: { x: number; y: number }, numColumns: number) => boolean;
  /** Resizes a widget when the new size fits where it is; false otherwise. */
  resizeWidget: (id: string, size: WidgetSize, numColumns: number) => boolean;
  /** Sets a widget's size without a fit check (Configure); the layout moves whatever it now overlaps. */
  setWidgetSize: (id: string, size: WidgetSize) => void;
  /** Moves a widget earlier/later in the board order and re-packs the board from the top. */
  reorderWidget: (id: string, direction: -1 | 1, numColumns: number) => void;
  /** Re-packs every widget from the top, in board order. */
  arrangeWidgets: (numColumns: number) => void;
  resetWidgets: () => void;
}

/** Persisted name and shape are frozen identity (BigBoard `stores/dashboard`; preserved across logout for BigBoard). */
export const DASHBOARD_LAYOUT_STORE_NAME = 'dashboard-widgets';
const LAYOUT_VERSION = 3;

const generateWidgetId = (): string => `widget-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const toInt = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback);

/**
 * Cleans a persisted layout: unknown types (or values from a newer build) and repeats of a type are dropped, sizes are
 * at least 1×1 and positions whole cells. Version < 2 boards (BigBoard before its grid rewrite) are re-placed from the top.
 */
export function normalizeLayout(raw: unknown, version: number = LAYOUT_VERSION): DashboardWidget[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { widgets?: unknown }).widgets) ? ((raw as { widgets: unknown[] }).widgets ?? []) : [];
  const seenTypes = new Set<WidgetType>();
  const seenIds = new Set<string>();
  const widgets: DashboardWidget[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    if (!isWidgetType(item.type) || seenTypes.has(item.type)) continue;
    let id = typeof item.id === 'string' && item.id ? item.id : generateWidgetId();
    if (seenIds.has(id)) id = generateWidgetId();
    seenTypes.add(item.type);
    seenIds.add(id);
    const reset = version < 2;
    widgets.push({ id, type: item.type, x: reset ? -1 : Math.max(-1, toInt(item.x, -1)), y: reset ? -1 : Math.max(-1, toInt(item.y, -1)), w: Math.max(1, toInt(item.w, 1)), h: Math.max(1, toInt(item.h, 1)) });
  }
  return widgets;
}

const currentLayout = (widgets: readonly DashboardWidget[], numColumns: number): Map<string, GridRect> => layoutWidgets(widgets, numColumns);

export const useDashboardStore = create<DashboardLayoutState>()(
  persist(
    (set, get) => ({
      widgets: [],

      addWidget: (type, grid) => {
        const { widgets } = get();
        if (widgets.some((widget) => widget.type === type)) return null;
        const base = defaultWidgetSize(type, grid.sizeClass);
        const size = { w: Math.min(base.w, Math.max(1, grid.maxWidgetWidth)), h: Math.min(base.h, Math.max(1, grid.maxWidgetHeight)) };
        const occupied = Array.from(currentLayout(widgets, grid.numColumns).values());
        const slot = findFirstFreeSlot(occupied, size, grid.numColumns);
        const id = generateWidgetId();
        set({ widgets: [...widgets, { id, type, x: slot.x, y: slot.y, ...size }] });
        return id;
      },

      removeWidget: (id) => set((state) => ({ widgets: state.widgets.filter((widget) => widget.id !== id) })),

      moveWidget: (id, cell, numColumns) => {
        const { widgets } = get();
        const next = moveItem(widgets, currentLayout(widgets, numColumns), id, cell, numColumns);
        if (!next) return false;
        set({ widgets: next });
        return true;
      },

      resizeWidget: (id, size, numColumns) => {
        const { widgets } = get();
        const next = resizeItem(widgets, currentLayout(widgets, numColumns), id, size, numColumns);
        if (!next) return false;
        set({ widgets: next });
        return true;
      },

      setWidgetSize: (id, size) => set((state) => ({ widgets: state.widgets.map((widget) => (widget.id === id ? { ...widget, w: Math.max(1, Math.round(size.w)), h: Math.max(1, Math.round(size.h)) } : widget)) })),

      reorderWidget: (id, direction, numColumns) => {
        const reordered = reorderItems(get().widgets, id, direction);
        if (reordered) set({ widgets: packItems(reordered, numColumns) });
      },

      arrangeWidgets: (numColumns) => set((state) => ({ widgets: packItems(state.widgets, numColumns) })),

      resetWidgets: () => set({ widgets: [] }),
    }),
    {
      name: DASHBOARD_LAYOUT_STORE_NAME,
      version: LAYOUT_VERSION,
      storage: createJSONStorage(() => dashboardStateStorage),
      partialize: (state) => ({ widgets: state.widgets }),
      migrate: (persisted, version) => ({ widgets: normalizeLayout(persisted, version) }) as unknown as DashboardLayoutState,
      merge: (persisted, current) => (persisted === undefined || persisted === null ? current : { ...current, widgets: normalizeLayout(persisted) }),
    }
  )
);

registerDashboardStore(DASHBOARD_LAYOUT_STORE_NAME, useDashboardStore);
