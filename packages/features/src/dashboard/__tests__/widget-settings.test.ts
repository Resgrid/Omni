import { CALLS_COLUMNS, defaultWidgetSettings, migrateLegacyWidgetSettings, normalizeColumnOrder, normalizeWidgetSettings, PERSONNEL_COLUMNS } from '../lib/widget-settings';
import { dataSourcesFor, defaultWidgetSize, isWidgetType, WIDGET_DATA_SOURCES, WIDGET_LABEL_KEYS, WIDGET_TYPES } from '../lib/widget-types';

describe('widget types', () => {
  it('lists all 14 widget types with labels, sizes and data sources', () => {
    expect(WIDGET_TYPES).toHaveLength(14);
    for (const type of WIDGET_TYPES) {
      expect(WIDGET_LABEL_KEYS[type]).toMatch(/^widgets\./);
      expect(defaultWidgetSize(type, 'large').w).toBeGreaterThanOrEqual(defaultWidgetSize(type, 'compact').w);
      expect(Array.isArray(WIDGET_DATA_SOURCES[type])).toBe(true);
    }
    expect(isWidgetType('unit_alerts')).toBe(true);
    expect(isWidgetType('weather_radar')).toBe(false);
  });

  it('unions the data the board needs', () => {
    expect(Array.from(dataSourcesFor(['time'])).length).toBe(0);
    expect(dataSourcesFor(['unit_alerts', 'units_summary'])).toEqual(new Set(['units', 'unitAlerts', 'config']));
  });
});

describe('normalizeWidgetSettings', () => {
  it('fills missing sections and rejects bad values', () => {
    const settings = normalizeWidgetSettings({
      personnel: { fontSize: 2, showGroup: 'yes', hideGroups: ['1', 2, null, '1'], columnOrder: ['status', 'bogus', 'name'] },
      calls: { display: 'grid', fontSize: 99 },
      map: { zoomLevel: 40, latitude: 123, longitude: -100.5 },
      weather: { units: 'kelvin' },
      callsSummary: { priorityIds: ['3', 1, 'x'], maxPrioritiesToShow: -2 },
      scheduledCalls: { colorThresholdRedMinutes: 90, colorThresholdYellowMinutes: 30, colorThresholdGreenMinutes: 10, colorRedHex: 'red', sortBy: 'random', sortOrder: 'desc' },
      notes: { category: ' None ' },
    });
    expect(settings.personnel.fontSize).toBe(8);
    expect(settings.personnel.showGroup).toBe(true);
    expect(settings.personnel.hideGroups).toEqual(['1', '2']);
    expect(settings.personnel.columnOrder).toEqual(['status', 'name', 'group', 'staffing', 'roles', 'timestamp']);
    expect(settings.calls.display).toBe('cards');
    expect(settings.calls.fontSize).toBe(30);
    expect(settings.map).toMatchObject({ zoomLevel: 20, latitude: 0, longitude: -100.5 });
    expect(settings.weather.units).toBe('imperial');
    expect(settings.callsSummary).toMatchObject({ priorityIds: [3, 1], maxPrioritiesToShow: 0 });
    // Thresholds stay ordered red ≤ yellow ≤ green; a bad colour falls back.
    expect(settings.scheduledCalls).toMatchObject({ colorThresholdRedMinutes: 90, colorThresholdYellowMinutes: 90, colorThresholdGreenMinutes: 90, colorRedHex: '#EF4444', sortBy: 'scheduledTime', sortOrder: 'desc' });
    expect(settings.notes.category).toBe('');
    expect(settings.time).toEqual(defaultWidgetSettings().time);
  });

  it('returns defaults for garbage and never shares arrays between copies', () => {
    expect(normalizeWidgetSettings(null)).toEqual(defaultWidgetSettings());
    const a = defaultWidgetSettings();
    a.personnel.hideGroups.push('9');
    expect(defaultWidgetSettings().personnel.hideGroups).toEqual([]);
  });

  it('completes column orders', () => {
    expect(normalizeColumnOrder(['dispatched', 'id'], CALLS_COLUMNS)).toEqual(['dispatched', 'id', 'name', 'address', 'timestamp', 'priority']);
    expect(normalizeColumnOrder('nope', PERSONNEL_COLUMNS)).toEqual([...PERSONNEL_COLUMNS]);
  });
});

describe('migrateLegacyWidgetSettings (BigBoard widget-settings v0)', () => {
  const legacyBlob = {
    personnel: { showGroup: false, fontSize: 18, respondingText: 'Responding', notRespondingText: 'NR', hideNotResponding: true, sortOrders: [{ groupId: '1', weight: 2 }] },
    calls: { showUser: true, showLinkedCalls: false, dispatchScrollSpeed: 0, fontSize: 16 },
    scheduledCalls: { dispatchScrollSpeed: 40 },
    notes: { category: 'None', includeUncategorized: false },
  };

  it('keeps the toggles the configure screen wrote, drops dead and text-matched fields, keeps the call table', () => {
    const migrated = migrateLegacyWidgetSettings(legacyBlob, () => undefined);
    expect(migrated.personnel).toMatchObject({ showGroup: false, fontSize: 18, hideNotResponding: true });
    expect(migrated.personnel).not.toHaveProperty('respondingText');
    expect(migrated.personnel).not.toHaveProperty('sortOrders');
    expect(migrated.calls).toMatchObject({ display: 'table', scrollDispatches: false, fontSize: 16 });
    expect(migrated.calls).not.toHaveProperty('showUser');
    expect(migrated.scheduledCalls.scrollDispatches).toBe(true);
    expect(migrated.notes).toEqual({ category: '', includeUncategorized: false });
  });

  it('imports column orders (and scheduled-call filters) from the legacy AsyncStorage stores when readable', () => {
    const stores: Record<string, string> = {
      'personnel-widget-settings': JSON.stringify({ state: { settings: { columnOrder: ['timestamp', 'name'] } }, version: 0 }),
      'scheduled-calls-widget-settings': JSON.stringify({ state: { settings: { filterUnitIds: ['7'], sortBy: 'priority', columnOrder: ['dispatched'] } } }),
      'units-widget-settings': 'not json',
    };
    const migrated = migrateLegacyWidgetSettings(legacyBlob, (key) => stores[key]);
    expect(migrated.personnel.columnOrder.slice(0, 2)).toEqual(['timestamp', 'name']);
    expect(migrated.personnel.showGroup).toBe(false);
    expect(migrated.scheduledCalls).toMatchObject({ filterUnitIds: ['7'], sortBy: 'priority' });
    expect(migrated.scheduledCalls.columnOrder[0]).toBe('dispatched');
    expect(migrated.units.columnOrder).toEqual(defaultWidgetSettings().units.columnOrder);
  });
});
