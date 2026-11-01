// @resgrid/features/settings — the Settings screen and its section registry, Storage & sync, device preferences and the
// navigation-app hand-off (omni-plan §7.10, §8.2a). App shell: configureSettings({ storageSync, activeUnit }) after
// initOffline(); pass getLocationPreferences/subscribePreferences to configureLocation and getThemeMode() to
// GluestackUIProvider.
import './sections/built-in';

// Screens
export { SettingsScreen } from './screens/settings-screen';
export { StorageSyncScreen } from './screens/storage-sync-screen';

// Registry and composition
export { getSettingsSections, registerSettingsSection, resetSettingsSectionsForTests, type SettingsSection, type SettingsSectionContext, subscribeSettingsSections } from './registry';
export { type ActiveUnitAdapter, configureSettings, getActiveUnitAdapter, getStorageSyncServices, resetSettingsRuntimeForTests, type SettingsRuntime, type StorageSyncServices } from './runtime';
export { BUILT_IN_SETTINGS_SECTIONS } from './sections/built-in';

// Building blocks for variant sections
export { SettingsCard, SettingsRow, type SettingsRowProps, ToggleRow, type ToggleRowProps } from './components/settings-row';
export { type StorageSync, type SyncNowOutcome, useOutboxSnapshot, useStorageSync } from './hooks/use-storage-sync';
export { UnitSelectionSheet } from './sections/unit-section';
export { BluetoothDeviceSheet } from './sections/voice-section';

// Device preferences and the navigation hand-off
export { ageParts, formatBytes } from './lib/format';
export { ALL_NAVIGATION_APPS, getNavigationApp, getNavigationAppOptions, NAVIGATION_APP_LABEL_KEYS, NAVIGATION_APP_STORAGE_KEY, type NavigationApp, normalizeNavigationApp, setNavigationApp } from './lib/navigation-app';
export { buildNavigationAttempts, openMapsWithAddress, openMapsWithDirections, toNavigationCoordinates } from './lib/navigation-handoff';
export {
  BACKGROUND_GEOLOCATION_KEY,
  getKeepAlivePreference,
  getLocationPreferences,
  getThemeMode,
  type LocationPreferences,
  notifyPreferencesChanged,
  REALTIME_GEOLOCATION_KEY,
  setBackgroundGeolocationPreference,
  setKeepAlivePreference,
  setRealtimeGeolocationPreference,
  setThemeMode,
  subscribePreferences,
  usePreferencesVersion,
} from './lib/preferences';

// Registry entries
export { settingsNavEntries } from './nav';
export { type SettingsRouteName, settingsRoutes } from './routes';
