import { DurableKv } from '../durable-kv';
import { createWebKvBackend, RAW_LAYOUT_LEDGER_KEY, type StorageLike } from '../web-backend';

function createStorage(initial: Record<string, string> = {}): StorageLike & { dump(): Record<string, string>; clear: jest.Mock } {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (index) => Array.from(map.keys())[index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: jest.fn(() => map.clear()),
    dump: () => Object.fromEntries(map),
  };
}

describe('web backend, react-native-mmkv layout', () => {
  it('reads values a legacy web build stored under `<id>\\<key>`', () => {
    const storage = createStorage({ 'ResgridDispatch\\baseUrl': '"https://dispatch.example.com/api/v4"', 'ResgridDispatch\\IS_FIRST_TIME': 'false', 'ResgridDispatch\\count': '3' });
    const kv = new DurableKv(createWebKvBackend({ id: 'ResgridDispatch', layout: 'mmkv-prefixed', storage }));
    expect(kv.getJSON('baseUrl')).toBe('https://dispatch.example.com/api/v4');
    expect(kv.getBoolean('IS_FIRST_TIME')).toBe(false);
    expect(kv.getNumber('count')).toBe(3);
    expect(kv.keys().sort()).toEqual(['IS_FIRST_TIME', 'baseUrl', 'count']);
  });

  it('clears only its own prefix, never the whole origin', () => {
    const storage = createStorage({ 'ResgridDispatch\\a': '1', 'auth-storage\\token': 't', SELECTED_THEME: 'dark', i18nextLng: 'de' });
    new DurableKv(createWebKvBackend({ id: 'ResgridDispatch', layout: 'mmkv-prefixed', storage })).clear();
    expect(storage.clear).not.toHaveBeenCalled();
    expect(storage.dump()).toEqual({ 'auth-storage\\token': 't', SELECTED_THEME: 'dark', i18nextLng: 'de' });
  });

  it('rejects ids and keys with a backslash like react-native-mmkv web', () => {
    expect(() => createWebKvBackend({ id: 'a\\b', layout: 'mmkv-prefixed', storage: createStorage() })).toThrow();
    const backend = createWebKvBackend({ id: 'a', layout: 'mmkv-prefixed', storage: createStorage() });
    expect(() => backend.set('x\\y', '1')).toThrow();
  });
});

describe('web backend, BigBoard raw layout', () => {
  it('reads un-prefixed legacy keys', () => {
    const storage = createStorage({ baseUrl: '"https://bb.example.com"', 'dashboard-widgets': '{"state":{}}' });
    const kv = new DurableKv(createWebKvBackend({ id: 'ResgridUnit', layout: 'raw', storage }));
    expect(kv.getJSON('baseUrl')).toBe('https://bb.example.com');
    expect(kv.getString('dashboard-widgets')).toBe('{"state":{}}');
  });

  it('offers no clearAll (origin-wide) and wipes only keys it owns', () => {
    const storage = createStorage({
      authResponse: '{"token":"x"}',
      api_cache_units: '{}',
      SELECTED_THEME: 'dark',
      cly_device_id: 'countly',
      i18nextLng: 'de',
      'ResgridDispatch\\other': '1',
    });
    const backend = createWebKvBackend({ id: 'ResgridUnit', layout: 'raw', storage });
    expect(backend.clearAll).toBeUndefined();
    const kv = new DurableKv(backend);
    kv.set('written-by-omni', 'v');
    expect(storage.getItem(RAW_LAYOUT_LEDGER_KEY)).toContain('written-by-omni');

    kv.clear({ preserve: ['SELECTED_THEME'] });

    expect(storage.clear).not.toHaveBeenCalled();
    expect(storage.dump()).toEqual({ SELECTED_THEME: 'dark', cly_device_id: 'countly', i18nextLng: 'de', 'ResgridDispatch\\other': '1', [RAW_LAYOUT_LEDGER_KEY]: '[]' });
  });

  it('accepts a custom legacy-owned predicate for persisted store names', () => {
    const storage = createStorage({ 'widget-settings': '{}', unrelated: 'x' });
    const kv = new DurableKv(createWebKvBackend({ id: 'ResgridUnit', layout: 'raw', storage, legacyOwnedKey: (key) => key === 'widget-settings' }));
    expect(kv.keys()).toEqual(['widget-settings']);
  });
});
