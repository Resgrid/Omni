import { registerDataStoreReset } from '@resgrid/data';
import { create } from 'zustand';

import type { ActivityLogEntry, ConsoleTab, RadioLogEntry } from '../lib/console-types';

/** Entries kept in the activity and radio logs (newest first). */
export const MAX_LOG_ENTRIES = 100;

/**
 * Dispatch console view state (Dispatch baseline `dispatch-console-store` + `unit-bulk-actions-store` selection): the
 * call the console is filtered to, the selected unit or person, the multi-unit selection, the activity tab, and the
 * in-memory activity and radio logs. Never persisted; cleared on sign-out.
 */
interface ConsoleData {
  selectedCallId: string | null;
  isCallFilterActive: boolean;
  selectedUnitId: string | null;
  selectedPersonnelId: string | null;
  /** Multi-unit selection: a tap adds/removes a unit instead of opening its own actions. */
  isSelectionMode: boolean;
  selectedUnitIds: string[];
  activeTab: ConsoleTab;
  activityLog: ActivityLogEntry[];
  radioLog: RadioLogEntry[];
}

export interface ConsoleState extends ConsoleData {
  /** Selecting the filtered call again clears the filter. Returns true when the filter is now on. */
  toggleCallFilter: (callId: string) => boolean;
  clearCallFilter: () => void;
  /** Toggles the selected unit (clears a selected person). Returns true when it is now selected. */
  selectUnit: (unitId: string) => boolean;
  /** Toggles the selected person (clears a selected unit). Returns true when they are now selected. */
  selectPersonnel: (userId: string) => boolean;
  setActiveTab: (tab: ConsoleTab) => void;
  addActivity: (entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>) => void;
  clearActivity: () => void;
  startRadioTransmission: (participantId: string, participantName: string) => void;
  endRadioTransmission: (participantId: string) => void;
  clearRadioLog: () => void;
  /** Starts a multi-unit selection, taking along the single selected unit and `seed`. */
  startSelection: (seed?: string[]) => void;
  endSelection: () => void;
  toggleUnitInSelection: (unitId: string) => void;
  addUnitsToSelection: (unitIds: string[]) => void;
  clearSelection: () => void;
}

const initialData = (): ConsoleData => ({
  selectedCallId: null,
  isCallFilterActive: false,
  selectedUnitId: null,
  selectedPersonnelId: null,
  isSelectionMode: false,
  selectedUnitIds: [],
  activeTab: 'activity',
  activityLog: [],
  radioLog: [],
});

let sequence = 0;
const nextId = (): string => {
  sequence += 1;
  return `${Date.now().toString(36)}-${sequence.toString(36)}`;
};

export const useConsoleStore = create<ConsoleState>()((set, get) => ({
  ...initialData(),

  toggleCallFilter: (callId) => {
    const { selectedCallId, isCallFilterActive } = get();
    if (selectedCallId === callId && isCallFilterActive) {
      set({ selectedCallId: null, isCallFilterActive: false, activeTab: get().activeTab === 'checkins' ? 'activity' : get().activeTab });
      return false;
    }
    // A call picked for filtering surfaces its quick actions (note, close, add resources).
    set({ selectedCallId: callId, isCallFilterActive: true, activeTab: 'actions' });
    return true;
  },

  clearCallFilter: () => set((state) => ({ selectedCallId: null, isCallFilterActive: false, activeTab: state.activeTab === 'checkins' ? 'activity' : state.activeTab })),

  selectUnit: (unitId) => {
    if (get().selectedUnitId === unitId) {
      set({ selectedUnitId: null });
      return false;
    }
    // A single unit selected ends a multi-unit selection; its actions take the tab.
    set({ selectedUnitId: unitId, selectedPersonnelId: null, isSelectionMode: false, selectedUnitIds: [], activeTab: 'actions' });
    return true;
  },

  selectPersonnel: (userId) => {
    if (get().selectedPersonnelId === userId) {
      set({ selectedPersonnelId: null });
      return false;
    }
    set({ selectedPersonnelId: userId, selectedUnitId: null, isSelectionMode: false, selectedUnitIds: [], activeTab: 'actions' });
    return true;
  },

  setActiveTab: (activeTab) => set({ activeTab }),

  addActivity: (entry) => set((state) => ({ activityLog: [{ ...entry, id: nextId(), timestamp: Date.now() }, ...state.activityLog].slice(0, MAX_LOG_ENTRIES) })),

  clearActivity: () => set({ activityLog: [] }),

  startRadioTransmission: (participantId, participantName) => {
    if (get().radioLog.some((entry) => entry.participantId === participantId && entry.isActive)) return;
    const entry: RadioLogEntry = { id: nextId(), participantId, participantName, startedAt: Date.now(), endedAt: null, duration: null, isActive: true };
    set((state) => ({ radioLog: [entry, ...state.radioLog].slice(0, MAX_LOG_ENTRIES) }));
  },

  endRadioTransmission: (participantId) => {
    const endedAt = Date.now();
    set((state) => ({
      radioLog: state.radioLog.map((entry) => (entry.participantId === participantId && entry.isActive ? { ...entry, endedAt, duration: Math.round((endedAt - entry.startedAt) / 1000), isActive: false } : entry)),
    }));
  },

  clearRadioLog: () => set({ radioLog: [] }),

  startSelection: (seed = []) => {
    const { selectedUnitId } = get();
    const ids = Array.from(new Set([...(selectedUnitId ? [selectedUnitId] : []), ...seed]));
    set({ isSelectionMode: true, selectedUnitIds: ids, selectedUnitId: null, selectedPersonnelId: null, activeTab: ids.length > 0 ? 'actions' : get().activeTab });
  },

  endSelection: () => set({ isSelectionMode: false, selectedUnitIds: [] }),

  toggleUnitInSelection: (unitId) => {
    const { selectedUnitIds } = get();
    const next = selectedUnitIds.includes(unitId) ? selectedUnitIds.filter((id) => id !== unitId) : [...selectedUnitIds, unitId];
    // The first unit of a selection surfaces the bulk status form.
    set({ isSelectionMode: true, selectedUnitIds: next, ...(selectedUnitIds.length === 0 && next.length > 0 ? { activeTab: 'actions' as ConsoleTab } : {}) });
  },

  addUnitsToSelection: (unitIds) => {
    const next = Array.from(new Set([...get().selectedUnitIds, ...unitIds]));
    set({ isSelectionMode: true, selectedUnitIds: next, ...(next.length > 0 ? { activeTab: 'actions' as ConsoleTab } : {}) });
  },

  clearSelection: () => set({ selectedUnitIds: [] }),
}));

registerDataStoreReset<ConsoleState>('dispatch-console', useConsoleStore, initialData);
