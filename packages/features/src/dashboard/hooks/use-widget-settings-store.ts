import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dashboardStateStorage, readDashboardKey, registerDashboardStore } from '../lib/storage';
import { defaultWidgetSettings, migrateLegacyWidgetSettings, normalizeWidgetSettings, type WidgetSettings, type WidgetSettingsSection } from '../lib/widget-settings';

export interface WidgetSettingsState extends WidgetSettings {
  /** Merges a partial update into one widget type's settings. */
  updateSettings: <S extends WidgetSettingsSection>(section: S, patch: Partial<WidgetSettings[S]>) => void;
  /** Puts one widget type back to its defaults. */
  resetSection: (section: WidgetSettingsSection) => void;
  resetAllSettings: () => void;
}

/** Persisted name is frozen identity (BigBoard `stores/widget-settings`; preserved across logout for BigBoard). */
export const WIDGET_SETTINGS_STORE_NAME = 'widget-settings';
const SETTINGS_VERSION = 1;

const pickSettings = (state: WidgetSettings): WidgetSettings => ({
  personnel: state.personnel,
  units: state.units,
  calls: state.calls,
  map: state.map,
  weather: state.weather,
  notes: state.notes,
  time: state.time,
  personnelStatusSummary: state.personnelStatusSummary,
  personnelStaffingSummary: state.personnelStaffingSummary,
  unitsSummary: state.unitsSummary,
  callsSummary: state.callsSummary,
  weatherAlerts: state.weatherAlerts,
  scheduledCalls: state.scheduledCalls,
});

export const useWidgetSettingsStore = create<WidgetSettingsState>()(
  persist(
    (set) => ({
      ...defaultWidgetSettings(),
      updateSettings: (section, patch) =>
        set((state) => {
          // Normalized as a whole so a bad value (a font size of 0, a half-filled column order) never reaches a widget.
          const next = normalizeWidgetSettings({ ...pickSettings(state), [section]: { ...state[section], ...patch } });
          return { [section]: next[section] } as Partial<WidgetSettingsState>;
        }),
      resetSection: (section) => set({ [section]: defaultWidgetSettings()[section] } as Partial<WidgetSettingsState>),
      resetAllSettings: () => set(defaultWidgetSettings()),
    }),
    {
      name: WIDGET_SETTINGS_STORE_NAME,
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => dashboardStateStorage),
      partialize: (state) => pickSettings(state),
      // BigBoard wrote version 0; its column orders lived in separate AsyncStorage stores (readable on web/Electron).
      migrate: (persisted, version) => (version < 1 ? migrateLegacyWidgetSettings(persisted, readDashboardKey) : normalizeWidgetSettings(persisted)) as unknown as WidgetSettingsState,
      merge: (persisted, current) => (persisted === undefined || persisted === null ? current : { ...current, ...normalizeWidgetSettings(persisted) }),
    }
  )
);

registerDashboardStore(WIDGET_SETTINGS_STORE_NAME, useWidgetSettingsStore);

/** One widget type's settings (stable reference until that section changes). */
export const useWidgetSettings = <S extends WidgetSettingsSection>(section: S): WidgetSettings[S] => useWidgetSettingsStore((state) => state[section]);
