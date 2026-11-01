// Jest setup for the Responder member modules that use auth-ui's dialogs and sheets (calendar, certifications,
// approve-sign-in). Import it FIRST: on top of the shared feature setup it adds stand-ins for the analytics and crash
// SDKs that @resgrid/core's barrel loads through auth-ui (their packages ship untransformed ESM), and the language list
// auth-ui reads from @resgrid/i18n.
import '../../status/__tests__/test-setup';

jest.mock('countly-sdk-react-native-bridge', () => ({ __esModule: true, default: { initWithConfig: jest.fn(), events: { recordEvent: jest.fn() }, userData: { setProperties: jest.fn() } } }));
jest.mock('countly-sdk-react-native-bridge/CountlyConfig', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  wrap: (component: unknown) => component,
  reactNavigationIntegration: jest.fn(() => ({})),
}));

// Not hoisted (doMock), so it replaces the shared setup's i18n stand-in: same key-echoing `t`, plus the language API.
jest.doMock('@resgrid/i18n', () => {
  const mockLanguages = ['en', 'ar', 'de', 'el', 'es', 'fr', 'it', 'pl', 'sv', 'uk'];
  const mockT = (key: string, options?: Record<string, unknown>) => {
    if (options && typeof options.defaultValue === 'string' && !key.includes('.')) return options.defaultValue;
    const values = options ? Object.entries(options).filter(([name]) => name !== 'defaultValue') : [];
    return values.length > 0 ? `${key}:${values.map(([, value]) => String(value)).join(',')}` : key;
  };
  const mockI18n = { language: 'en', exists: () => true };
  return {
    SUPPORTED_LANGUAGES: mockLanguages,
    LEGACY_LANGUAGE_STORAGE_KEY: 'local',
    isSupportedLanguage: (value: unknown) => typeof value === 'string' && mockLanguages.includes(value),
    getCurrentLanguage: () => mockI18n.language,
    setLanguage: jest.fn(async () => undefined),
    useTranslation: () => ({ t: mockT, i18n: mockI18n }),
    translate: mockT,
  };
});
