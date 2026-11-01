import type { LucideIcon } from 'lucide-react-native';
import { Activity, CalendarClock, ChartColumn, Clock, CloudLightning, CloudSun, Map as MapIcon, PhoneCall, StickyNote, TriangleAlert, Truck, UserCheck, Users, UsersRound } from 'lucide-react-native';

/**
 * The 14 BigBoard widget types. The string values are persisted in the `dashboard-widgets` layout (frozen identity:
 * a renamed value would drop the widget from every upgraded board), so never change one.
 */
export const WidgetTypes = {
  PERSONNEL: 'personnel',
  UNITS: 'units',
  CALLS: 'calls',
  MAP: 'map',
  WEATHER: 'weather',
  NOTES: 'notes',
  TIME: 'time',
  PERSONNEL_STATUS_SUMMARY: 'personnel_status_summary',
  PERSONNEL_STAFFING_SUMMARY: 'personnel_staffing_summary',
  UNITS_SUMMARY: 'units_summary',
  CALLS_SUMMARY: 'calls_summary',
  WEATHER_ALERTS: 'weather_alerts',
  SCHEDULED_CALLS: 'scheduled_calls',
  UNIT_ALERTS: 'unit_alerts',
} as const;

export type WidgetType = (typeof WidgetTypes)[keyof typeof WidgetTypes];

/** Every widget type in the order the add menu and the configure screen list them. */
export const WIDGET_TYPES: readonly WidgetType[] = [
  WidgetTypes.CALLS,
  WidgetTypes.UNITS,
  WidgetTypes.PERSONNEL,
  WidgetTypes.MAP,
  WidgetTypes.UNIT_ALERTS,
  WidgetTypes.SCHEDULED_CALLS,
  WidgetTypes.CALLS_SUMMARY,
  WidgetTypes.UNITS_SUMMARY,
  WidgetTypes.PERSONNEL_STATUS_SUMMARY,
  WidgetTypes.PERSONNEL_STAFFING_SUMMARY,
  WidgetTypes.WEATHER,
  WidgetTypes.WEATHER_ALERTS,
  WidgetTypes.NOTES,
  WidgetTypes.TIME,
];

export const isWidgetType = (value: unknown): value is WidgetType => typeof value === 'string' && (WIDGET_TYPES as readonly string[]).includes(value);

/** Translation keys of the widget names (legacy BigBoard `widgets.*` keys, so the existing translations apply). */
export const WIDGET_LABEL_KEYS: Readonly<Record<WidgetType, string>> = {
  personnel: 'widgets.personnel',
  units: 'widgets.units',
  calls: 'widgets.calls',
  map: 'widgets.map',
  weather: 'widgets.weather',
  notes: 'widgets.notes',
  time: 'widgets.time',
  personnel_status_summary: 'widgets.personnel_status_summary',
  personnel_staffing_summary: 'widgets.personnel_staffing_summary',
  units_summary: 'widgets.units_summary',
  calls_summary: 'widgets.calls_summary',
  weather_alerts: 'widgets.weather_alerts',
  scheduled_calls: 'widgets.scheduled_calls',
  unit_alerts: 'widgets.unit_alerts',
};

/** Department-renameable module behind a widget (`useTerm`), when there is one. */
export const WIDGET_TERM_KEYS: Readonly<Partial<Record<WidgetType, string>>> = {
  personnel: 'module.personnel',
  units: 'module.units',
  calls: 'module.calls',
  notes: 'module.notes',
};

export const WIDGET_ICONS: Readonly<Record<WidgetType, LucideIcon>> = {
  personnel: Users,
  units: Truck,
  calls: PhoneCall,
  map: MapIcon,
  weather: CloudSun,
  notes: StickyNote,
  time: Clock,
  personnel_status_summary: UserCheck,
  personnel_staffing_summary: UsersRound,
  units_summary: ChartColumn,
  calls_summary: Activity,
  weather_alerts: CloudLightning,
  scheduled_calls: CalendarClock,
  unit_alerts: TriangleAlert,
};

/** `compact` = phone and tablet grids, `large` = desktop, Electron and wall boards. */
export type GridSizeClass = 'compact' | 'large';

export interface WidgetSize {
  w: number;
  h: number;
}

const LARGE_SIZES: Readonly<Record<WidgetType, WidgetSize>> = {
  personnel: { w: 3, h: 3 },
  units: { w: 3, h: 3 },
  calls: { w: 3, h: 3 },
  map: { w: 4, h: 4 },
  weather: { w: 2, h: 2 },
  notes: { w: 2, h: 2 },
  time: { w: 2, h: 1 },
  personnel_status_summary: { w: 2, h: 2 },
  personnel_staffing_summary: { w: 2, h: 2 },
  units_summary: { w: 2, h: 2 },
  calls_summary: { w: 2, h: 2 },
  weather_alerts: { w: 2, h: 2 },
  scheduled_calls: { w: 3, h: 3 },
  unit_alerts: { w: 2, h: 2 },
};

const COMPACT_SIZES: Readonly<Record<WidgetType, WidgetSize>> = {
  personnel: { w: 2, h: 2 },
  units: { w: 2, h: 2 },
  calls: { w: 2, h: 2 },
  map: { w: 2, h: 3 },
  weather: { w: 1, h: 1 },
  notes: { w: 1, h: 1 },
  time: { w: 1, h: 1 },
  personnel_status_summary: { w: 1, h: 1 },
  personnel_staffing_summary: { w: 1, h: 1 },
  units_summary: { w: 1, h: 1 },
  calls_summary: { w: 1, h: 1 },
  weather_alerts: { w: 1, h: 1 },
  scheduled_calls: { w: 2, h: 2 },
  unit_alerts: { w: 1, h: 1 },
};

/** The size a newly added widget gets (BigBoard's platform-aware defaults). */
export const defaultWidgetSize = (type: WidgetType, sizeClass: GridSizeClass): WidgetSize => (sizeClass === 'large' ? LARGE_SIZES[type] : COMPACT_SIZES[type]);

/** Server data a widget reads; the dashboard loads and live-refreshes only what the widgets on the board need. */
export type DashboardDataSource = 'calls' | 'callPriorities' | 'scheduledCalls' | 'units' | 'personnel' | 'personnelOptions' | 'notes' | 'weatherAlerts' | 'unitAlerts' | 'config';

export const WIDGET_DATA_SOURCES: Readonly<Record<WidgetType, readonly DashboardDataSource[]>> = {
  personnel: ['personnel'],
  units: ['units', 'unitAlerts', 'config'],
  calls: ['calls', 'callPriorities'],
  map: ['config'],
  weather: ['config'],
  notes: ['notes'],
  time: [],
  personnel_status_summary: ['personnel', 'personnelOptions'],
  personnel_staffing_summary: ['personnel', 'personnelOptions'],
  units_summary: ['units'],
  calls_summary: ['calls', 'callPriorities'],
  weather_alerts: ['weatherAlerts'],
  scheduled_calls: ['scheduledCalls', 'callPriorities'],
  unit_alerts: ['units', 'unitAlerts', 'config'],
};

/** The union of data sources the given widgets need. */
export const dataSourcesFor = (types: readonly WidgetType[]): Set<DashboardDataSource> => {
  const sources = new Set<DashboardDataSource>();
  for (const type of types) for (const source of WIDGET_DATA_SOURCES[type]) sources.add(source);
  return sources;
};
