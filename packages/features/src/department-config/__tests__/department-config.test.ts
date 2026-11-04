import { logger } from '@resgrid/core/logging/logger';
import type { GetConfigResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { setDepartmentConfig, useDepartmentConfigStore } from '../hooks/use-department-config-store';

interface ConfigAnswer {
  Data: Partial<GetConfigResultData>;
}

const mockGetConfig = jest.fn<Promise<ConfigAnswer>, []>();

jest.mock('@resgrid/api', () => ({ ...jest.requireActual('@resgrid/api'), getConfig: () => mockGetConfig() }));

jest.mock('@resgrid/data', () => ({ ...jest.requireActual('@resgrid/data'), hasDataApiContext: () => true, getDataApiContext: () => ({}) }));

beforeEach(() => {
  mockGetConfig.mockReset();
  setDepartmentConfig(null);
});

describe('department config', () => {
  it('asks the server once however many screens ask at the same time, and keeps the last config on a failure', async () => {
    let answer: (value: ConfigAnswer) => void = () => undefined;

    mockGetConfig.mockImplementation(() => new Promise<ConfigAnswer>((resolve) => (answer = resolve)));
    const first = useDepartmentConfigStore.getState().load();
    const second = useDepartmentConfigStore.getState().load({ bypassCache: true });

    expect(mockGetConfig).toHaveBeenCalledTimes(1);
    answer({ Data: { UnitStatusThresholds: [{ BaseType: 2, WarnSeconds: 60, AlertSeconds: 120 }] } });
    await Promise.all([first, second]);
    expect(useDepartmentConfigStore.getState().config?.UnitStatusThresholds).toHaveLength(1);

    mockGetConfig.mockRejectedValueOnce(new Error('offline'));
    await useDepartmentConfigStore.getState().load({ bypassCache: true });
    expect(mockGetConfig).toHaveBeenCalledTimes(2);
    expect(useDepartmentConfigStore.getState()).toMatchObject({ isLoading: false, hasError: false });
    expect(useDepartmentConfigStore.getState().config?.UnitStatusThresholds).toHaveLength(1);
  });

  it('logs a failed load by its kind and status only, never the request', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    // An axios-style refusal: the request it carries holds the bearer token.
    const refusal = Object.assign(new Error('Request failed with status code 503'), { response: { status: 503 }, config: { headers: { Authorization: 'Bearer secret-token' } } });

    mockGetConfig.mockRejectedValueOnce(refusal);
    await useDepartmentConfigStore.getState().load();

    expect(warn).toHaveBeenCalledWith({ message: 'Department config load failed', context: { code: 'server', status: 503 } });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-token');
    expect(useDepartmentConfigStore.getState()).toMatchObject({ isLoading: false, hasError: true });
    warn.mockRestore();
  });

  it("takes the shell's copy over a late answer and is dropped on sign-out", async () => {
    let answer: (value: ConfigAnswer) => void = () => undefined;

    mockGetConfig.mockImplementation(() => new Promise<ConfigAnswer>((resolve) => (answer = resolve)));
    const late = useDepartmentConfigStore.getState().load();

    // SAFETY: a test fixture; only the field asserted is set.
    setDepartmentConfig({ OpenWeatherApiKey: 'shell' } as GetConfigResultData);
    answer({ Data: { OpenWeatherApiKey: 'late' } });
    await late;
    expect(useDepartmentConfigStore.getState().config?.OpenWeatherApiKey).toBe('shell');

    await defaultResetRegistry.getStoreResets().get('data.department-config')?.('logout');
    expect(useDepartmentConfigStore.getState().config).toBeNull();
  });
});
