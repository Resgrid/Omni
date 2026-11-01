import { detectDeviceLanguage, resolveInitialLanguage } from '../detect';

jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => []) }));

const localization = jest.requireMock('expo-localization') as { getLocales: jest.Mock };

describe('device language detection (Unit/IC)', () => {
  it('picks the first SUPPORTED language among all device locales', () => {
    expect(detectDeviceLanguage([{ languageCode: 'ca' }, { languageCode: 'es' }, { languageCode: 'en' }])).toBe('es');
  });

  it('falls back to English when nothing is supported', () => {
    expect(detectDeviceLanguage([{ languageCode: 'ja' }, { languageCode: 'pt' }])).toBe('en');
    expect(detectDeviceLanguage([])).toBe('en');
  });

  it('reads the language tag when the code is missing, case-insensitively', () => {
    expect(detectDeviceLanguage([{ languageCode: null, languageTag: 'sv-SE' }])).toBe('sv');
    expect(detectDeviceLanguage([{ languageCode: 'UK' }])).toBe('uk');
  });

  it('reads expo-localization by default and survives it throwing', () => {
    localization.getLocales.mockReturnValueOnce([{ languageCode: 'de', languageTag: 'de-AT' }]);
    expect(detectDeviceLanguage()).toBe('de');
    localization.getLocales.mockImplementationOnce(() => {
      throw new Error('native module missing');
    });
    expect(detectDeviceLanguage()).toBe('en');
  });

  it('honours a supported stored choice before the device language', () => {
    expect(resolveInitialLanguage('fr', [{ languageCode: 'de' }])).toBe('fr');
    expect(resolveInitialLanguage('pt', [{ languageCode: 'de' }])).toBe('de');
    expect(resolveInitialLanguage(null, [{ languageCode: 'ar' }])).toBe('ar');
  });
});
