// The entry's background-location bootstrap (apps/omni/background-location.ts): registered only for native builds whose
// app config enables background location, and when run it loads the variant root layout before the shell's startup.
import { type EntryBackgroundLocationDeps, loadVariantRootLayout, registerEntryBackgroundLocation } from '../background-location';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-router/_ctx', () => ({ ctx: Object.assign(() => undefined, { keys: () => [] }) }));
jest.mock('@resgrid/location/background-task', () => ({ getEntryLocationConfig: jest.fn(() => null), registerBackgroundLocationBootstrap: jest.fn() }));

const config = (background: boolean) => ({ variant: 'unit', background, transmission: 'unit' as const, source: 'extra.location' as const });

function deps(overrides: Partial<EntryBackgroundLocationDeps> = {}): EntryBackgroundLocationDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    platform: 'android',
    entryConfig: config(true),
    register: jest.fn(),
    loadRootLayout: jest.fn(async () => {
      calls.push('layout');
    }),
    runStartup: jest.fn(async () => {
      calls.push('startup');
    }),
    ...overrides,
  };
}

describe('registerEntryBackgroundLocation', () => {
  it('registers a bootstrap that loads the variant root layout, then runs startup', async () => {
    const d = deps();
    expect(registerEntryBackgroundLocation(d)).toBe(true);
    const bootstrap = (d.register as jest.Mock).mock.calls[0][0] as () => Promise<void>;
    await bootstrap();
    expect(d.calls).toEqual(['layout', 'startup']);
  });

  it.each([
    ['without background location in the app config', { entryConfig: config(false) }],
    ['without any entry config', { entryConfig: null }],
    ['on the web', { platform: 'web' }],
  ])('registers nothing %s', (_label, overrides) => {
    const d = deps(overrides);
    expect(registerEntryBackgroundLocation(d)).toBe(false);
    expect(d.register).not.toHaveBeenCalled();
  });

  it('lets a failed startup reject (the location runtime logs it and retries on the next batch)', async () => {
    const d = deps({ runStartup: jest.fn(async () => Promise.reject(new Error('storage unavailable'))) });
    registerEntryBackgroundLocation(d);
    const bootstrap = (d.register as jest.Mock).mock.calls[0][0] as () => Promise<void>;
    await expect(bootstrap()).rejects.toThrow('storage unavailable');
  });
});

describe('loadVariantRootLayout', () => {
  it("evaluates the route context's root layout module (and nothing else)", async () => {
    const context = Object.assign(
      jest.fn(() => ({ default: () => null })),
      { keys: () => ['./(app)/index.tsx', './_layout.tsx', './(app)/_layout.tsx'] }
    );
    await loadVariantRootLayout(context);
    expect(context).toHaveBeenCalledTimes(1);
    expect(context).toHaveBeenCalledWith('./_layout.tsx');
  });

  it('fails loudly when the context has no root layout', async () => {
    await expect(loadVariantRootLayout(Object.assign(jest.fn(), { keys: () => ['./index.tsx'] }))).rejects.toThrow(/no root _layout/);
  });
});
