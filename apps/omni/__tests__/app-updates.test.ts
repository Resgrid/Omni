// In-app OTA updates wiring (apps/omni/app-updates*.ts): iOS/Android hand @resgrid/core the real expo-updates module,
// web/Electron and development builds hand over nothing (docs/subsystems/app-updates.md).
const mockIsDev = jest.fn(() => false);

jest.mock('@resgrid/core', () => ({ isDev: () => mockIsDev() }));
jest.mock('expo-updates', () => ({
  __esModule: true,
  isEnabled: true,
  updateId: 'update-1',
  channel: 'production',
  runtimeVersion: 'abc123',
  createdAt: null,
  isEmbeddedLaunch: true,
  isEmergencyLaunch: false,
  emergencyLaunchReason: null,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

type AppUpdatesFile = { appUpdatesModule: unknown };

const load = (file: '../app-updates' | '../app-updates.native'): AppUpdatesFile => {
  let loaded: AppUpdatesFile | undefined;
  jest.isolateModules(() => {
    loaded = jest.requireActual<AppUpdatesFile>(file);
  });
  if (!loaded) throw new Error(`${file} did not load`);
  return loaded;
};

describe('app updates wiring', () => {
  beforeEach(() => mockIsDev.mockReturnValue(false));

  it('passes the expo-updates module itself on iOS/Android release builds', () => {
    const updates = jest.requireMock<Record<string, unknown>>('expo-updates');
    const { appUpdatesModule } = load('../app-updates.native');
    expect(appUpdatesModule).toBe(updates);
  });

  it('passes nothing in development builds', () => {
    mockIsDev.mockReturnValue(true);
    expect(load('../app-updates.native').appUpdatesModule).toBeNull();
  });

  it('passes nothing on web and Electron (expo-updates stays out of the web bundle)', () => {
    expect(load('../app-updates').appUpdatesModule).toBeNull();
  });
});
