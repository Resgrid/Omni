import { requireOptionalNativeModule } from 'expo-modules-core';

import { beginSpeechDucking, endSpeechDucking, excludeFromBackup, isExcludedFromBackup, resetNativeDeviceForTests } from '../native-device';

jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: jest.fn() }));

const mockRequire = requireOptionalNativeModule as jest.Mock;

const fakeModule = () => ({
  excludeFromBackupAsync: jest.fn(async () => true),
  isExcludedFromBackupAsync: jest.fn(async () => true),
  beginSpeechDuckingAsync: jest.fn(async () => true),
  endSpeechDuckingAsync: jest.fn(async () => true),
});

describe('native-device', () => {
  beforeEach(() => {
    resetNativeDeviceForTests();
    mockRequire.mockReset();
  });

  it('calls the ResgridDevice module and looks it up once', async () => {
    const module = fakeModule();
    mockRequire.mockReturnValue(module);

    expect(await excludeFromBackup('file:///docs/resgrid-offline-maps')).toBe(true);
    expect(await isExcludedFromBackup('file:///docs/resgrid-offline-maps')).toBe(true);
    expect(await beginSpeechDucking()).toBe(true);
    expect(await endSpeechDucking()).toBe(true);

    expect(module.excludeFromBackupAsync).toHaveBeenCalledWith('file:///docs/resgrid-offline-maps');
    expect(mockRequire).toHaveBeenCalledTimes(1);
    expect(mockRequire).toHaveBeenCalledWith('ResgridDevice');
  });

  it('resolves false without the module (web, tests, a build without it)', async () => {
    mockRequire.mockReturnValue(null);
    expect(await excludeFromBackup('file:///x')).toBe(false);
    expect(await beginSpeechDucking()).toBe(false);

    resetNativeDeviceForTests();
    mockRequire.mockImplementation(() => {
      throw new Error('no native modules');
    });
    expect(await endSpeechDucking()).toBe(false);
  });

  it('turns native failures and non-true answers into false', async () => {
    const module = fakeModule();
    module.beginSpeechDuckingAsync.mockRejectedValue(new Error('audio session busy'));
    module.excludeFromBackupAsync.mockResolvedValue(undefined as unknown as boolean);
    mockRequire.mockReturnValue(module);

    expect(await beginSpeechDucking()).toBe(false);
    expect(await excludeFromBackup('file:///x')).toBe(false);
  });
});
