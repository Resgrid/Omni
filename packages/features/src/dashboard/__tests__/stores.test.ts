import './test-setup';

import type { GetConfigResultData } from '@resgrid/models';
import { createMemoryKvBackend, defaultResetRegistry, DurableKv } from '@resgrid/offline';

import { DASHBOARD_LAYOUT_STORE_NAME, type DashboardWidget, normalizeLayout, useDashboardStore } from '../hooks/use-dashboard-store';
import { useDashboardViewStore } from '../hooks/use-dashboard-view-store';
import { setDashboardDepartmentConfig, useDashboardConfigStore } from '../hooks/use-department-config';
import { useWidgetSettingsStore, WIDGET_SETTINGS_STORE_NAME } from '../hooks/use-widget-settings-store';
import { computeGridConfig } from '../lib/grid';
import { setDashboardStorage } from '../lib/storage';
import { defaultWidgetSettings } from '../lib/widget-settings';

const desktop = computeGridConfig(1440, 'desktop');
const widget = (id: string, type: DashboardWidget['type'], x: number, y: number, w: number, h: number): DashboardWidget => ({ id, type, x, y, w, h });
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

let kv: DurableKv;

beforeEach(async () => {
  kv = new DurableKv(createMemoryKvBackend(`dashboard-${Math.random()}`));
  setDashboardStorage(kv);
  await flush();
  useDashboardStore.setState({ widgets: [] });
  useWidgetSettingsStore.getState().resetAllSettings();
  useDashboardViewStore.setState({ isEditMode: false, showAddMenu: false });
});

afterAll(() => setDashboardStorage(undefined));

describe('dashboard layout store', () => {
  it('adds each widget type once, at the first free cell with the platform default size', () => {
    const { addWidget } = useDashboardStore.getState();
    const calls = addWidget('calls', desktop);
    expect(calls).not.toBeNull();
    expect(addWidget('calls', desktop)).toBeNull();
    addWidget('map', desktop);
    const [first, second] = useDashboardStore.getState().widgets;
    expect(first).toMatchObject({ type: 'calls', x: 0, y: 0, w: 3, h: 3 });
    expect(second).toMatchObject({ type: 'map', x: 3, y: 0, w: 4, h: 4 });

    const phone = computeGridConfig(390, 'phone');
    useDashboardStore.setState({ widgets: [] });
    addWidget('map', phone);
    expect(useDashboardStore.getState().widgets[0]).toMatchObject({ w: 2, h: 3 });
  });

  it('moves to free cells only, resizes when it fits, removes', () => {
    useDashboardStore.setState({ widgets: [widget('a', 'calls', 0, 0, 2, 2), widget('b', 'time', 2, 0, 1, 1)] });
    const store = useDashboardStore.getState();
    expect(store.moveWidget('b', { x: 1, y: 0 }, 4)).toBe(false);
    expect(store.moveWidget('b', { x: 0, y: 2 }, 4)).toBe(true);
    expect(useDashboardStore.getState().widgets[1]).toMatchObject({ x: 0, y: 2 });
    expect(useDashboardStore.getState().resizeWidget('a', { w: 4, h: 2 }, 4)).toBe(true);
    expect(useDashboardStore.getState().resizeWidget('a', { w: 4, h: 3 }, 4)).toBe(false);
    useDashboardStore.getState().removeWidget('a');
    expect(useDashboardStore.getState().widgets.map((entry) => entry.id)).toEqual(['b']);
  });

  it('reorders and arranges by re-packing from the top', () => {
    useDashboardStore.setState({ widgets: [widget('a', 'calls', 0, 5, 2, 1), widget('b', 'time', 3, 9, 2, 1), widget('c', 'notes', 1, 1, 4, 1)] });
    useDashboardStore.getState().reorderWidget('c', -1, 4);
    expect(useDashboardStore.getState().widgets.map(({ id, x, y }) => `${id}@${x},${y}`)).toEqual(['a@0,0', 'c@0,1', 'b@2,0']);
    useDashboardStore.getState().setWidgetSize('a', { w: 1, h: 1 });
    useDashboardStore.getState().arrangeWidgets(4);
    expect(useDashboardStore.getState().widgets.map(({ id, x, y }) => `${id}@${x},${y}`)).toEqual(['a@0,0', 'c@0,1', 'b@1,0']);
  });

  it('persists under the frozen name and reads BigBoard layouts back (v2 kept, v1 re-placed, unknown types dropped)', async () => {
    useDashboardStore.getState().addWidget('units', desktop);
    await flush();
    const saved = JSON.parse(kv.getString(DASHBOARD_LAYOUT_STORE_NAME) ?? '{}') as { state: { widgets: DashboardWidget[] }; version: number };
    expect(saved.version).toBe(3);
    expect(saved.state.widgets[0]).toMatchObject({ type: 'units' });
    expect(saved.state).not.toHaveProperty('isEditMode');

    kv.set(
      DASHBOARD_LAYOUT_STORE_NAME,
      JSON.stringify({
        state: {
          widgets: [
            { id: 'w1', key: 'w1', type: 'personnel', name: 'Personnel', x: 2, y: 1, w: 3, h: 2 },
            { id: 'w2', key: 'w2', type: 'radar', name: 'Radar', x: 0, y: 0, w: 1, h: 1 },
            { id: 'w3', key: 'w3', type: 'personnel', name: 'Personnel again', x: 0, y: 0, w: 1, h: 1 },
          ],
          isEditMode: true,
        },
        version: 2,
      })
    );
    await useDashboardStore.persist.rehydrate();
    expect(useDashboardStore.getState().widgets).toEqual([{ id: 'w1', type: 'personnel', x: 2, y: 1, w: 3, h: 2 }]);

    expect(normalizeLayout({ widgets: [{ id: 'old', type: 'map', x: 4, y: 4, w: 2, h: 2 }] }, 1)).toEqual([{ id: 'old', type: 'map', x: -1, y: -1, w: 2, h: 2 }]);
    expect(normalizeLayout('garbage')).toEqual([]);
  });
});

describe('widget settings store', () => {
  it('normalizes updates and resets one section', () => {
    const store = useWidgetSettingsStore.getState();
    store.updateSettings('personnel', { fontSize: 100, showGroup: false });
    expect(useWidgetSettingsStore.getState().personnel).toMatchObject({ fontSize: 30, showGroup: false });
    store.updateSettings('scheduledCalls', { colorThresholdRedMinutes: 500 });
    expect(useWidgetSettingsStore.getState().scheduledCalls.colorThresholdYellowMinutes).toBe(500);
    useWidgetSettingsStore.getState().resetSection('personnel');
    expect(useWidgetSettingsStore.getState().personnel).toEqual(defaultWidgetSettings().personnel);
  });

  it('migrates BigBoard v0 settings, pulling column orders from the legacy stores in the same storage', async () => {
    // zustand wrote every BigBoard blob with `version: 0`.
    kv.set(WIDGET_SETTINGS_STORE_NAME, JSON.stringify({ state: { units: { showType: false, fontSize: 20 }, calls: { dispatchScrollSpeed: 40 } }, version: 0 }));
    kv.set('units-widget-settings', JSON.stringify({ state: { settings: { columnOrder: ['state', 'name'] } }, version: 0 }));
    await useWidgetSettingsStore.persist.rehydrate();
    const { units, calls } = useWidgetSettingsStore.getState();
    expect(units).toMatchObject({ showType: false, fontSize: 20 });
    expect(units.columnOrder.slice(0, 2)).toEqual(['state', 'name']);
    expect(calls.display).toBe('table');
    await flush();
    expect(JSON.parse(kv.getString(WIDGET_SETTINGS_STORE_NAME) ?? '{}').version).toBe(1);
  });
});

describe('dashboard view store', () => {
  it('opens the add menu in edit mode and closes it when editing ends', () => {
    useDashboardViewStore.getState().setShowAddMenu(true);
    expect(useDashboardViewStore.getState()).toMatchObject({ isEditMode: true, showAddMenu: true });
    useDashboardViewStore.getState().toggleEditMode();
    expect(useDashboardViewStore.getState()).toMatchObject({ isEditMode: false, showAddMenu: false });
    useDashboardViewStore.getState().toggleEditMode();
    expect(useDashboardViewStore.getState().isEditMode).toBe(true);
  });
});

describe('dashboard department config', () => {
  it('takes the shell’s copy and is dropped on sign-out (device layout and settings are kept)', async () => {
    useDashboardStore.setState({ widgets: [widget('a', 'time', 0, 0, 1, 1)] });
    setDashboardDepartmentConfig({ OpenWeatherApiKey: 'k', UnitStatusThresholds: [] } as unknown as GetConfigResultData);
    expect(useDashboardConfigStore.getState().config?.OpenWeatherApiKey).toBe('k');
    await defaultResetRegistry.getStoreResets().get('data.dashboard-config')?.('logout');
    expect(useDashboardConfigStore.getState().config).toBeNull();
    expect(useDashboardStore.getState().widgets).toHaveLength(1);
  });
});
