import { setOfflineLogger } from '../../util/logger';
import { CONTRACT_KEYS, readLegacyString, writeLegacyString } from '../contract-keys';
import { DurableKv } from '../durable-kv';
import { createMemoryKvBackend } from '../memory-backend';
import type { KvBackend } from '../types';
import { createGuardedStateStorage } from '../zustand-storage';

const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

beforeEach(() => setOfflineLogger(logger));
afterAll(() => setOfflineLogger(null));

describe('DurableKv', () => {
  it('round-trips strings, numbers, booleans and JSON', () => {
    const kv = new DurableKv(createMemoryKvBackend('test'));
    kv.set('s', 'value');
    kv.set('n', 42);
    kv.set('b', true);
    kv.setJSON('j', { a: 1 });
    expect(kv.getString('s')).toBe('value');
    expect(kv.getNumber('n')).toBe(42);
    expect(kv.getBoolean('b')).toBe(true);
    expect(kv.getJSON<{ a: number }>('j')).toEqual({ a: 1 });
    expect(kv.keys().sort()).toEqual(['b', 'j', 'n', 's']);
  });

  describe('corrupt values (Unit getItem)', () => {
    it('drops a value that does not parse and returns a clean miss', () => {
      const kv = new DurableKv(createMemoryKvBackend('test', { broken: '{not json' }));
      expect(kv.getJSON('broken')).toBeNull();
      expect(kv.contains('broken')).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ message: 'Dropped corrupt stored value', context: { instance: 'test', key: 'broken' } }));
    });

    it('keeps the value when asked to read leniently', () => {
      const kv = new DurableKv(createMemoryKvBackend('test', { broken: '{not json' }));
      expect(kv.getJSON('broken', { deleteOnCorrupt: false })).toBeNull();
      expect(kv.getString('broken')).toBe('{not json');
    });

    it('treats a value that fails validation as corrupt', () => {
      const kv = new DurableKv(createMemoryKvBackend('test', { n: '"text"' }));
      const isNumber = (value: unknown): value is number => typeof value === 'number';
      expect(kv.getJSON('n', { validate: isNumber })).toBeNull();
      expect(kv.contains('n')).toBe(false);
    });

    it('returns null for an empty string', () => {
      const kv = new DurableKv(createMemoryKvBackend('test', { empty: '' }));
      expect(kv.getJSON('empty')).toBeNull();
    });
  });

  describe('guarded backend (Dispatch/BigBoard)', () => {
    const throwing: KvBackend = {
      id: 'broken',
      getString: () => {
        throw new Error('io');
      },
      getNumber: () => {
        throw new Error('io');
      },
      getBoolean: () => {
        throw new Error('io');
      },
      set: () => {
        throw new Error('quota');
      },
      delete: () => {
        throw new Error('io');
      },
      contains: () => {
        throw new Error('io');
      },
      getAllKeys: () => {
        throw new Error('io');
      },
    };

    it('never throws and returns fallbacks', () => {
      const kv = new DurableKv(throwing);
      expect(kv.getString('a')).toBeUndefined();
      expect(kv.getNumber('a')).toBeUndefined();
      expect(kv.getBoolean('a')).toBeUndefined();
      expect(kv.set('a', 'b')).toBe(false);
      expect(kv.contains('a')).toBe(false);
      expect(kv.keys()).toEqual([]);
      expect(() => kv.delete('a')).not.toThrow();
    });

    it('logs the key name but never the value', () => {
      const kv = new DurableKv(throwing);
      kv.set('authResponse', 'secret-token');
      const logged = JSON.stringify(logger.error.mock.calls);
      expect(logged).toContain('authResponse');
      expect(logged).not.toContain('secret-token');
    });
  });

  describe('clear', () => {
    it('keeps preserved keys and removes the rest', () => {
      const kv = new DurableKv(createMemoryKvBackend('test', { local: 'de', SELECTED_THEME: 'dark', authResponse: '{}', api_cache_x: '{}' }));
      const result = kv.clear({ preserve: ['local', 'SELECTED_THEME'] });
      expect(result).toEqual({ removed: 2, preserved: 2 });
      expect(kv.keys().sort()).toEqual(['SELECTED_THEME', 'local']);
    });

    it('accepts a predicate', () => {
      const kv = new DurableKv(createMemoryKvBackend('test', { keep_1: 'a', drop: 'b' }));
      kv.clear({ preserve: (key) => key.startsWith('keep_') });
      expect(kv.keys()).toEqual(['keep_1']);
    });

    it("uses the backend's instance-scoped clearAll when nothing is preserved", () => {
      const backend = createMemoryKvBackend('test', { a: '1', b: '2' });
      const clearAll = jest.spyOn(backend, 'clearAll');
      new DurableKv(backend).clear();
      expect(clearAll).toHaveBeenCalledTimes(1);
    });

    it('deletes key by key when the backend has no clearAll', () => {
      const backend = createMemoryKvBackend('test', { a: '1', b: '2' });
      delete (backend as { clearAll?: () => void }).clearAll;
      const kv = new DurableKv(backend);
      expect(kv.clear().removed).toBe(2);
      expect(kv.keys()).toEqual([]);
    });
  });

  it('estimates its size from keys and values', () => {
    const kv = new DurableKv(createMemoryKvBackend('test', { ab: 'cdef' }));
    expect(kv.sizeEstimateBytes()).toBe(6);
  });
});

describe('legacy string helpers', () => {
  it('reads JSON-encoded strings written by lib/storage setItem', () => {
    const kv = new DurableKv(createMemoryKvBackend('test', { baseUrl: '"https://api.resgrid.com/api/v4"' }));
    expect(readLegacyString(kv, CONTRACT_KEYS.baseUrl)).toBe('https://api.resgrid.com/api/v4');
  });

  it('reads raw strings written by useMMKVString and never deletes them', () => {
    const kv = new DurableKv(createMemoryKvBackend('test', { SELECTED_THEME: 'dark', odd: '"unterminated' }));
    expect(readLegacyString(kv, CONTRACT_KEYS.selectedTheme)).toBe('dark');
    expect(readLegacyString(kv, 'odd')).toBe('"unterminated');
    expect(kv.contains('odd')).toBe(true);
    expect(readLegacyString(kv, 'missing')).toBeNull();
  });

  it('writes the JSON-encoded form', () => {
    const kv = new DurableKv(createMemoryKvBackend('test'));
    writeLegacyString(kv, 'activeCallId', '123');
    expect(kv.getString('activeCallId')).toBe('"123"');
  });
});

describe('createGuardedStateStorage', () => {
  it('passes persisted store state through', () => {
    const kv = new DurableKv(createMemoryKvBackend('test'));
    const storage = createGuardedStateStorage(kv);
    storage.setItem('core-storage', '{"state":{"a":1},"version":0}');
    expect(storage.getItem('core-storage')).toBe('{"state":{"a":1},"version":0}');
    storage.removeItem('core-storage');
    expect(storage.getItem('core-storage')).toBeNull();
  });

  it('drops a corrupt blob instead of breaking rehydration', () => {
    const kv = new DurableKv(createMemoryKvBackend('test', { 'auth-storage': '{"state":' }));
    const storage = createGuardedStateStorage(kv);
    expect(storage.getItem('auth-storage')).toBeNull();
    expect(kv.contains('auth-storage')).toBe(false);
  });

  it('swallows write failures', () => {
    const backend = createMemoryKvBackend('test');
    backend.set = () => {
      throw new Error('quota exceeded');
    };
    const storage = createGuardedStateStorage(new DurableKv(backend));
    expect(() => storage.setItem('core-storage', '{}')).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ message: 'Persisted store state was not saved' }));
  });
});
