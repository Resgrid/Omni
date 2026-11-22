import { create } from 'zustand';

/**
 * Which desk sheet is open. The sign-in, take-a-break and sign-off sheets open from the status bar, the desk and the
 * breaks screen alike, and are drawn once by `DispatcherDeskHost`, so two can never stack. Not persisted.
 */
export type DeskSheet = 'signIn' | 'takeBreak' | 'signOff';

export interface DeskSheetRequest {
  /** Take a break: start this planned break (else a new one now). */
  plannedBreakId?: string | null;
}

interface DeskUiState {
  sheet: DeskSheet | null;
  request: DeskSheetRequest;
  openSheet: (sheet: DeskSheet, request?: DeskSheetRequest) => void;
  closeSheet: () => void;
}

export const useDeskUiStore = create<DeskUiState>((set) => ({
  sheet: null,
  request: {},
  openSheet: (sheet, request = {}) => set({ sheet, request }),
  closeSheet: () => set({ sheet: null, request: {} }),
}));

export const openDeskSheet = (sheet: DeskSheet, request?: DeskSheetRequest): void => useDeskUiStore.getState().openSheet(sheet, request);
