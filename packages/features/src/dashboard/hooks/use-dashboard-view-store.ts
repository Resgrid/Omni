import { create } from 'zustand';

/** Dashboard view state (edit mode, add menu): feature-owned and never persisted — a board always starts locked. */
export interface DashboardViewState {
  isEditMode: boolean;
  showAddMenu: boolean;
  setEditMode: (isEditMode: boolean) => void;
  toggleEditMode: () => void;
  setShowAddMenu: (showAddMenu: boolean) => void;
}

export const useDashboardViewStore = create<DashboardViewState>()((set) => ({
  isEditMode: false,
  showAddMenu: false,
  // Leaving edit mode closes the add menu too.
  setEditMode: (isEditMode) => set(isEditMode ? { isEditMode } : { isEditMode, showAddMenu: false }),
  toggleEditMode: () => set((state) => (state.isEditMode ? { isEditMode: false, showAddMenu: false } : { isEditMode: true })),
  setShowAddMenu: (showAddMenu) => set(showAddMenu ? { showAddMenu, isEditMode: true } : { showAddMenu }),
}));
