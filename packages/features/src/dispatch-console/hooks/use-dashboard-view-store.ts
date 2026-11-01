import { dataPersistOptions, registerPersistedStore } from '@resgrid/data';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { DashboardCardKey } from '../lib/console-types';

/**
 * Dispatch console view preferences (Dispatch baseline `dashboard-view-store`): show only available resources, merge
 * units and personnel into one list, and which cards are collapsed. Persisted per device under the legacy store name
 * `dashboard-view-storage` (frozen identity), so the console looks the same after an upgrade and a new sign-in.
 */
export interface DashboardViewState {
  availableOnly: boolean;
  singleList: boolean;
  collapsedCards: Partial<Record<DashboardCardKey, boolean>>;
  toggleAvailableOnly: () => void;
  toggleSingleList: () => void;
  setCardCollapsed: (card: DashboardCardKey, collapsed: boolean) => void;
}

type PersistedView = Pick<DashboardViewState, 'availableOnly' | 'singleList' | 'collapsedCards'>;

export const DASHBOARD_VIEW_STORE_NAME = 'dashboard-view-storage';

export const useDashboardViewStore = create<DashboardViewState>()(
  persist(
    (set) => ({
      availableOnly: false,
      singleList: false,
      collapsedCards: {},
      toggleAvailableOnly: () => set((state) => ({ availableOnly: !state.availableOnly })),
      toggleSingleList: () => set((state) => ({ singleList: !state.singleList })),
      setCardCollapsed: (card, collapsed) => set((state) => ({ collapsedCards: { ...state.collapsedCards, [card]: collapsed } })),
    }),
    dataPersistOptions<DashboardViewState, PersistedView>({
      name: DASHBOARD_VIEW_STORE_NAME,
      partialize: (state) => ({ availableOnly: state.availableOnly, singleList: state.singleList, collapsedCards: state.collapsedCards }),
    })
  )
);

registerPersistedStore(DASHBOARD_VIEW_STORE_NAME, useDashboardViewStore);

/** A card's collapsed flag (defaults to expanded). */
export const selectCardCollapsed =
  (card: DashboardCardKey) =>
  (state: Pick<DashboardViewState, 'collapsedCards'>): boolean =>
    state.collapsedCards[card] ?? false;
