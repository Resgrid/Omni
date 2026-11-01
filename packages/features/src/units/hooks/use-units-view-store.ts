import { type AvailabilityFilter } from '@resgrid/features/status';
import { create } from 'zustand';

/** View state of the units list (search, server filters, availability): feature-owned, never persisted with domain data. */
export interface UnitsViewState {
  query: string;
  selectedFilters: string[];
  availability: AvailabilityFilter;
  setQuery: (query: string) => void;
  toggleFilter: (filterId: string) => void;
  clearFilters: () => void;
  setAvailability: (availability: AvailabilityFilter) => void;
}

export const useUnitsViewStore = create<UnitsViewState>()((set) => ({
  query: '',
  selectedFilters: [],
  availability: 'all',
  setQuery: (query) => set({ query }),
  toggleFilter: (filterId) => set((state) => ({ selectedFilters: state.selectedFilters.includes(filterId) ? state.selectedFilters.filter((id) => id !== filterId) : [...state.selectedFilters, filterId] })),
  clearFilters: () => set({ selectedFilters: [] }),
  setAvailability: (availability) => set({ availability }),
}));
