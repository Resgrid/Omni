/**
 * Per-widget settings (one set per widget type: a board shows each widget type once). Shapes follow BigBoard's
 * `widget-settings` store so an upgraded board keeps its choices; fixes folded in while porting:
 * - BigBoard kept a second copy of the personnel/units/calls/scheduled-calls settings in AsyncStorage stores that the
 *   widgets read while the configure screen wrote the MMKV copy, so most toggles never reached the board. One store now.
 * - Text-matched personnel options (`respondingText`, `notRespondingText`, `unavailableText`) became meaning-based
 *   (status/staffing BaseType); never decide what a status means from its name.
 * - Settings no widget ever read (`showUser`, `showLinkedCalls`, `showEta`, `sortOrders`) are dropped.
 */

export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 30;

export type PersonnelColumnKey = 'name' | 'group' | 'staffing' | 'status' | 'roles' | 'timestamp';
export type UnitsColumnKey = 'name' | 'station' | 'type' | 'state' | 'timestamp';
export type CallsColumnKey = 'id' | 'name' | 'address' | 'timestamp' | 'priority' | 'dispatched';
export type ScheduledCallsColumnKey = 'name' | 'scheduledTime' | 'priority' | 'address' | 'dispatched';

export const PERSONNEL_COLUMNS: readonly PersonnelColumnKey[] = ['name', 'group', 'staffing', 'status', 'roles', 'timestamp'];
export const UNITS_COLUMNS: readonly UnitsColumnKey[] = ['name', 'station', 'type', 'state', 'timestamp'];
export const CALLS_COLUMNS: readonly CallsColumnKey[] = ['id', 'name', 'address', 'timestamp', 'priority', 'dispatched'];
export const SCHEDULED_CALLS_COLUMNS: readonly ScheduledCallsColumnKey[] = ['name', 'scheduledTime', 'priority', 'address', 'dispatched'];

export interface PersonnelWidgetSettings {
  showGroup: boolean;
  showStaffing: boolean;
  showStatus: boolean;
  showRoles: boolean;
  showTimestamp: boolean;
  /** People whose status means responding (dispatched, responding, en route) first. */
  sortRespondingToTop: boolean;
  /** Hide people whose status means "not responding". */
  hideNotResponding: boolean;
  /** Hide people whose staffing means unavailable or off duty. */
  hideUnavailable: boolean;
  fontSize: number;
  /** Group ids whose members are not shown. */
  hideGroups: string[];
  columnOrder: PersonnelColumnKey[];
}

export interface UnitsWidgetSettings {
  showStation: boolean;
  showType: boolean;
  showState: boolean;
  showTimestamp: boolean;
  fontSize: number;
  hideGroups: string[];
  columnOrder: UnitsColumnKey[];
}

export type CallsDisplay = 'cards' | 'table';

export interface CallsWidgetSettings {
  /** `cards`: the shared call rows at wall density; `table`: the configurable columns. */
  display: CallsDisplay;
  showId: boolean;
  showName: boolean;
  showTimestamp: boolean;
  showPriority: boolean;
  showAddress: boolean;
  showDispatched: boolean;
  /** Scroll the dispatch badges when they do not fit (marquee). */
  scrollDispatches: boolean;
  fontSize: number;
  columnOrder: CallsColumnKey[];
}

export interface MapWidgetSettings {
  zoomLevel: number;
  /** Fit the camera to every pin instead of the fixed centre and zoom. */
  showAllMarkers: boolean;
  hideLabels: boolean;
  showCalls: boolean;
  showStations: boolean;
  showUnits: boolean;
  showPersonnel: boolean;
  /** 0/0 = the department's map centre. */
  latitude: number;
  longitude: number;
}

export type WeatherUnits = 'standard' | 'metric' | 'imperial';

export interface WeatherWidgetSettings {
  units: WeatherUnits;
  /** 0/0 = the department's map centre. */
  latitude: number;
  longitude: number;
}

export interface NotesWidgetSettings {
  /** '' = every category. */
  category: string;
  includeUncategorized: boolean;
}

export interface TimeWidgetSettings {
  format24Hour: boolean;
  showSeconds: boolean;
}

export interface StatusSummarySettings {
  fontSize: number;
  showColors: boolean;
}

export interface UnitsSummarySettings {
  fontSize: number;
  showAvailable: boolean;
  showResponding: boolean;
  showOnScene: boolean;
}

export interface CallsSummarySettings {
  fontSize: number;
  showRecentCall: boolean;
  showPriorityCounts: boolean;
  /** How many priority rows to show; 0 = all (custom priorities must never be truncated away). */
  maxPrioritiesToShow: number;
  /** Priority ids to show, in this order; empty = every department priority. */
  priorityIds: number[];
}

export interface WeatherAlertsWidgetSettings {
  fontSize: number;
  showExtreme: boolean;
  showSevere: boolean;
  showModerate: boolean;
  showMinor: boolean;
  showUnknown: boolean;
  showCategoryMet: boolean;
  showCategoryFire: boolean;
  showCategoryHealth: boolean;
  showCategoryEnv: boolean;
  showCategoryOther: boolean;
  showHeadline: boolean;
  showArea: boolean;
  showExpiry: boolean;
  maxAlertsInWidget: number;
}

export type ScheduledCallsSortBy = 'scheduledTime' | 'priority' | 'name';
export type SortOrder = 'asc' | 'desc';

export interface ScheduledCallsWidgetSettings {
  showName: boolean;
  showScheduledTime: boolean;
  showPriority: boolean;
  showAddress: boolean;
  showDispatched: boolean;
  scrollDispatches: boolean;
  fontSize: number;
  columnOrder: ScheduledCallsColumnKey[];
  sortBy: ScheduledCallsSortBy;
  sortOrder: SortOrder;
  filterGroupIds: string[];
  filterUnitIds: string[];
  filterPersonnelIds: string[];
  filterRoleIds: string[];
  colorThresholdRedMinutes: number;
  colorThresholdYellowMinutes: number;
  colorThresholdGreenMinutes: number;
  colorRedHex: string;
  colorYellowHex: string;
  colorGreenHex: string;
  colorDefaultHex: string;
}

export interface WidgetSettings {
  personnel: PersonnelWidgetSettings;
  units: UnitsWidgetSettings;
  calls: CallsWidgetSettings;
  map: MapWidgetSettings;
  weather: WeatherWidgetSettings;
  notes: NotesWidgetSettings;
  time: TimeWidgetSettings;
  personnelStatusSummary: StatusSummarySettings;
  personnelStaffingSummary: StatusSummarySettings;
  unitsSummary: UnitsSummarySettings;
  callsSummary: CallsSummarySettings;
  weatherAlerts: WeatherAlertsWidgetSettings;
  scheduledCalls: ScheduledCallsWidgetSettings;
}

export type WidgetSettingsSection = keyof WidgetSettings;

export const DEFAULT_WIDGET_SETTINGS: Readonly<WidgetSettings> = {
  personnel: {
    showGroup: true,
    showStaffing: true,
    showStatus: true,
    showRoles: true,
    showTimestamp: true,
    sortRespondingToTop: true,
    hideNotResponding: false,
    hideUnavailable: false,
    fontSize: 14,
    hideGroups: [],
    columnOrder: [...PERSONNEL_COLUMNS],
  },
  units: { showStation: true, showType: true, showState: true, showTimestamp: true, fontSize: 14, hideGroups: [], columnOrder: [...UNITS_COLUMNS] },
  calls: {
    display: 'cards',
    showId: true,
    showName: true,
    showTimestamp: true,
    showPriority: true,
    showAddress: true,
    showDispatched: true,
    scrollDispatches: true,
    fontSize: 14,
    columnOrder: [...CALLS_COLUMNS],
  },
  map: { zoomLevel: 12, showAllMarkers: true, hideLabels: false, showCalls: true, showStations: true, showUnits: true, showPersonnel: true, latitude: 0, longitude: 0 },
  weather: { units: 'imperial', latitude: 0, longitude: 0 },
  notes: { category: '', includeUncategorized: true },
  time: { format24Hour: false, showSeconds: true },
  personnelStatusSummary: { fontSize: 14, showColors: true },
  personnelStaffingSummary: { fontSize: 14, showColors: true },
  unitsSummary: { fontSize: 14, showAvailable: true, showResponding: true, showOnScene: true },
  callsSummary: { fontSize: 14, showRecentCall: true, showPriorityCounts: true, maxPrioritiesToShow: 0, priorityIds: [] },
  weatherAlerts: {
    fontSize: 14,
    showExtreme: true,
    showSevere: true,
    showModerate: true,
    showMinor: true,
    showUnknown: true,
    showCategoryMet: true,
    showCategoryFire: true,
    showCategoryHealth: true,
    showCategoryEnv: true,
    showCategoryOther: true,
    showHeadline: true,
    showArea: true,
    showExpiry: true,
    maxAlertsInWidget: 3,
  },
  scheduledCalls: {
    showName: true,
    showScheduledTime: true,
    showPriority: true,
    showAddress: true,
    showDispatched: true,
    scrollDispatches: true,
    fontSize: 14,
    columnOrder: [...SCHEDULED_CALLS_COLUMNS],
    sortBy: 'scheduledTime',
    sortOrder: 'asc',
    filterGroupIds: [],
    filterUnitIds: [],
    filterPersonnelIds: [],
    filterRoleIds: [],
    colorThresholdRedMinutes: 15,
    colorThresholdYellowMinutes: 60,
    colorThresholdGreenMinutes: 240,
    colorRedHex: '#EF4444',
    colorYellowHex: '#F59E0B',
    colorGreenHex: '#10B981',
    colorDefaultHex: '#6B7280',
  },
};

export const WIDGET_SETTINGS_SECTIONS = Object.keys(DEFAULT_WIDGET_SETTINGS) as WidgetSettingsSection[];

/** A fresh, deep copy of the defaults (arrays are never shared between stores or tests). */
export const defaultWidgetSettings = (): WidgetSettings => JSON.parse(JSON.stringify(DEFAULT_WIDGET_SETTINGS)) as WidgetSettings;

// ------------------------------------------------------------------------------------------------ normalization

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);
const HEX = /^#[0-9a-f]{6}$/i;

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback);
const coordinate = (value: unknown, limit: number): number => (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : 0);
const stringList = (value: unknown): string[] => (Array.isArray(value) ? Array.from(new Set(value.filter((entry): entry is string | number => typeof entry === 'string' || typeof entry === 'number').map(String))) : []);
const numberList = (value: unknown): number[] =>
  Array.isArray(value) ? Array.from(new Set(value.map((entry) => (typeof entry === 'string' ? Number(entry) : entry)).filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry)))) : [];

/** A column order containing every known column exactly once (unknown ones dropped, missing ones appended). */
export function normalizeColumnOrder<K extends string>(value: unknown, all: readonly K[]): K[] {
  const seen = new Set<K>();
  if (Array.isArray(value)) for (const entry of value) if ((all as readonly unknown[]).includes(entry)) seen.add(entry as K);
  for (const column of all) seen.add(column);
  return Array.from(seen);
}

/** Copies the booleans, numbers and strings of `raw` that match the default's type; everything else keeps the default. */
function mergeScalars<T extends object>(defaults: T, raw: unknown): T {
  const next = { ...defaults } as Record<string, unknown>;
  if (!isRecord(raw)) return next as T;
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = raw[key];
    if (typeof fallback === 'boolean' && typeof value === 'boolean') next[key] = value;
    else if (typeof fallback === 'number' && typeof value === 'number' && Number.isFinite(value)) next[key] = value;
    else if (typeof fallback === 'string' && typeof value === 'string') next[key] = value;
  }
  return next as T;
}

const fontSize = (value: number, fallback: number): number => clampNumber(value, FONT_SIZE_MIN, FONT_SIZE_MAX, fallback);

/** Validates every section of persisted (or legacy) settings against the defaults. Never throws. */
export function normalizeWidgetSettings(raw: unknown): WidgetSettings {
  const d = defaultWidgetSettings();
  const source = isRecord(raw) ? raw : {};
  const section = (name: WidgetSettingsSection): Raw => (isRecord(source[name]) ? (source[name] as Raw) : {});

  const personnel = mergeScalars(d.personnel, section('personnel'));
  personnel.fontSize = fontSize(personnel.fontSize, d.personnel.fontSize);
  personnel.hideGroups = stringList(section('personnel').hideGroups);
  personnel.columnOrder = normalizeColumnOrder(section('personnel').columnOrder, PERSONNEL_COLUMNS);

  const units = mergeScalars(d.units, section('units'));
  units.fontSize = fontSize(units.fontSize, d.units.fontSize);
  units.hideGroups = stringList(section('units').hideGroups);
  units.columnOrder = normalizeColumnOrder(section('units').columnOrder, UNITS_COLUMNS);

  const calls = mergeScalars(d.calls, section('calls'));
  calls.display = section('calls').display === 'table' ? 'table' : section('calls').display === 'cards' ? 'cards' : d.calls.display;
  calls.fontSize = fontSize(calls.fontSize, d.calls.fontSize);
  calls.columnOrder = normalizeColumnOrder(section('calls').columnOrder, CALLS_COLUMNS);

  const map = mergeScalars(d.map, section('map'));
  map.zoomLevel = clampNumber(map.zoomLevel, 1, 20, d.map.zoomLevel);
  map.latitude = coordinate(section('map').latitude, 90);
  map.longitude = coordinate(section('map').longitude, 180);

  const weather = mergeScalars(d.weather, section('weather'));
  weather.units = weather.units === 'metric' || weather.units === 'standard' ? weather.units : 'imperial';
  weather.latitude = coordinate(section('weather').latitude, 90);
  weather.longitude = coordinate(section('weather').longitude, 180);

  const notes = mergeScalars(d.notes, section('notes'));
  // BigBoard stored the literal 'None' for "every category".
  notes.category = notes.category.trim() === 'None' ? '' : notes.category.trim();

  const time = mergeScalars(d.time, section('time'));

  const personnelStatusSummary = mergeScalars(d.personnelStatusSummary, section('personnelStatusSummary'));
  personnelStatusSummary.fontSize = fontSize(personnelStatusSummary.fontSize, d.personnelStatusSummary.fontSize);
  const personnelStaffingSummary = mergeScalars(d.personnelStaffingSummary, section('personnelStaffingSummary'));
  personnelStaffingSummary.fontSize = fontSize(personnelStaffingSummary.fontSize, d.personnelStaffingSummary.fontSize);

  const unitsSummary = mergeScalars(d.unitsSummary, section('unitsSummary'));
  unitsSummary.fontSize = fontSize(unitsSummary.fontSize, d.unitsSummary.fontSize);

  const callsSummary = mergeScalars(d.callsSummary, section('callsSummary'));
  callsSummary.fontSize = fontSize(callsSummary.fontSize, d.callsSummary.fontSize);
  callsSummary.maxPrioritiesToShow = clampNumber(callsSummary.maxPrioritiesToShow, 0, 50, 0);
  callsSummary.priorityIds = numberList(section('callsSummary').priorityIds);

  const weatherAlerts = mergeScalars(d.weatherAlerts, section('weatherAlerts'));
  weatherAlerts.fontSize = fontSize(weatherAlerts.fontSize, d.weatherAlerts.fontSize);
  weatherAlerts.maxAlertsInWidget = clampNumber(weatherAlerts.maxAlertsInWidget, 1, 50, d.weatherAlerts.maxAlertsInWidget);

  const scheduledRaw = section('scheduledCalls');
  const scheduledCalls = mergeScalars(d.scheduledCalls, scheduledRaw);
  scheduledCalls.fontSize = fontSize(scheduledCalls.fontSize, d.scheduledCalls.fontSize);
  scheduledCalls.columnOrder = normalizeColumnOrder(scheduledRaw.columnOrder, SCHEDULED_CALLS_COLUMNS);
  scheduledCalls.sortBy = scheduledCalls.sortBy === 'priority' || scheduledCalls.sortBy === 'name' ? scheduledCalls.sortBy : 'scheduledTime';
  scheduledCalls.sortOrder = scheduledCalls.sortOrder === 'desc' ? 'desc' : 'asc';
  scheduledCalls.filterGroupIds = stringList(scheduledRaw.filterGroupIds);
  scheduledCalls.filterUnitIds = stringList(scheduledRaw.filterUnitIds);
  scheduledCalls.filterPersonnelIds = stringList(scheduledRaw.filterPersonnelIds);
  scheduledCalls.filterRoleIds = stringList(scheduledRaw.filterRoleIds);
  const red = clampNumber(scheduledCalls.colorThresholdRedMinutes, 1, 10080, d.scheduledCalls.colorThresholdRedMinutes);
  const yellow = Math.max(red, clampNumber(scheduledCalls.colorThresholdYellowMinutes, 1, 10080, d.scheduledCalls.colorThresholdYellowMinutes));
  const green = Math.max(yellow, clampNumber(scheduledCalls.colorThresholdGreenMinutes, 1, 10080, d.scheduledCalls.colorThresholdGreenMinutes));
  scheduledCalls.colorThresholdRedMinutes = red;
  scheduledCalls.colorThresholdYellowMinutes = yellow;
  scheduledCalls.colorThresholdGreenMinutes = green;
  for (const key of ['colorRedHex', 'colorYellowHex', 'colorGreenHex', 'colorDefaultHex'] as const) {
    if (!HEX.test(scheduledCalls[key])) scheduledCalls[key] = d.scheduledCalls[key];
  }

  return { personnel, units, calls, map, weather, notes, time, personnelStatusSummary, personnelStaffingSummary, unitsSummary, callsSummary, weatherAlerts, scheduledCalls };
}

/** Legacy BigBoard AsyncStorage stores whose column orders were the only values the widgets honoured. */
export const LEGACY_COLUMN_STORES = {
  personnel: 'personnel-widget-settings',
  units: 'units-widget-settings',
  calls: 'calls-widget-settings',
  scheduledCalls: 'scheduled-calls-widget-settings',
} as const;

type LegacyColumnSection = keyof typeof LEGACY_COLUMN_STORES;

/** Reads `{ state: { settings } }` blobs the legacy AsyncStorage stores wrote (web/Electron share localStorage with the KV). */
const legacySettings = (read: (key: string) => string | undefined, key: string): Raw | null => {
  const raw = read(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const settings = isRecord(parsed) && isRecord(parsed.state) ? parsed.state.settings : null;
    return isRecord(settings) ? settings : null;
  } catch {
    return null;
  }
};

/**
 * Upgrades BigBoard's `widget-settings` blob (zustand version 0). Display toggles, font sizes and options come from the
 * MMKV store the configure screen wrote; column orders (and the scheduled-calls filters, sort and colours, which lived
 * only there) come from the legacy AsyncStorage stores when this device can read them. Upgraded boards keep the call
 * table they had; new boards start with call cards.
 */
export function migrateLegacyWidgetSettings(raw: unknown, read: (key: string) => string | undefined): WidgetSettings {
  const source: Raw = isRecord(raw) ? { ...raw } : {};
  for (const name of Object.keys(LEGACY_COLUMN_STORES) as LegacyColumnSection[]) {
    const legacy = legacySettings(read, LEGACY_COLUMN_STORES[name]);
    if (!legacy) continue;
    const current = isRecord(source[name]) ? (source[name] as Raw) : {};
    source[name] = name === 'scheduledCalls' ? { ...current, ...legacy } : { ...current, columnOrder: legacy.columnOrder };
  }
  const calls = isRecord(source.calls) ? (source.calls as Raw) : {};
  const scheduled = isRecord(source.scheduledCalls) ? (source.scheduledCalls as Raw) : {};
  source.calls = { display: 'table', ...calls, scrollDispatches: calls.dispatchScrollSpeed !== 0 };
  source.scheduledCalls = { ...scheduled, scrollDispatches: scheduled.dispatchScrollSpeed !== 0 };
  return normalizeWidgetSettings(source);
}
