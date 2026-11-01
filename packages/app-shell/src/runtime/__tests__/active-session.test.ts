import { loadActiveSession, resetActiveSession, setActiveCallId, setActiveUnitId, useActiveSessionStore } from '../active-session';
import { resetShellRuntimeForTests, setShellRuntime } from '../runtime-holder';
import { getActiveUnitId, setActiveUnitProvider } from '../session';

/** The bits of a DurableKv the active session touches (getString / setJSON / delete), backed by a Map. */
function fakeKv(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getString: (key: string) => data.get(key),
    setJSON: (key: string, value: unknown) => {
      data.set(key, JSON.stringify(value));
    },
    delete: (key: string) => {
      data.delete(key);
    },
  };
}

function useKv(kv: ReturnType<typeof fakeKv>): void {
  setShellRuntime({ offline: { storage: { main: kv } } as never });
}

describe('active session (active unit and call)', () => {
  beforeEach(() => {
    resetShellRuntimeForTests();
    resetActiveSession();
    setActiveUnitProvider(null);
  });

  it('loads the selection from the frozen legacy keys (raw or JSON strings)', () => {
    useKv(fakeKv({ activeUnitId: '"12"', activeCallId: '345' }));
    loadActiveSession();
    expect(useActiveSessionStore.getState()).toEqual({ activeUnitId: '12', activeCallId: '345' });
    expect(getActiveUnitId()).toBe('12');
  });

  it('persists a unit change, which also clears the call that belonged to the old unit', () => {
    const kv = fakeKv({ activeUnitId: '"12"', activeCallId: '"345"' });
    useKv(kv);
    loadActiveSession();

    setActiveUnitId('13');
    expect(useActiveSessionStore.getState()).toEqual({ activeUnitId: '13', activeCallId: null });
    expect(kv.data.get('activeUnitId')).toBe('"13"');
    expect(kv.data.has('activeCallId')).toBe(false);

    setActiveCallId('900');
    expect(kv.data.get('activeCallId')).toBe('"900"');
    setActiveCallId(null);
    expect(kv.data.has('activeCallId')).toBe(false);
    expect(useActiveSessionStore.getState().activeCallId).toBeNull();
  });

  it('keeps working in memory before storage is open, and resets on sign-out', () => {
    setActiveUnitId('  7 ');
    expect(useActiveSessionStore.getState().activeUnitId).toBe('7');
    resetActiveSession();
    expect(useActiveSessionStore.getState()).toEqual({ activeUnitId: null, activeCallId: null });
  });

  it('a registered unit provider still wins over the stored selection', () => {
    setActiveUnitId('7');
    setActiveUnitProvider(() => 'from-module');
    expect(getActiveUnitId()).toBe('from-module');
  });
});
