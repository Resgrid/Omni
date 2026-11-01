import fs from 'node:fs';
import path from 'node:path';

import type * as ConfigIndex from '@resgrid/config';

import type * as I18nIndex from '../index';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  I18nManager: { isRTL: false, allowRTL: jest.fn(), forceRTL: jest.fn() },
}));
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-US' }]) }));

type I18nModule = typeof I18nIndex;
type ConfigModule = typeof ConfigIndex;

const rn = jest.requireMock('react-native') as { Platform: { OS: string }; I18nManager: { isRTL: boolean; allowRTL: jest.Mock; forceRTL: jest.Mock } };
const localization = jest.requireMock('expo-localization') as { getLocales: jest.Mock };

const readManifest = (id: string): unknown => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../../apps/omni/variants/${id}/variant.json`), 'utf8'));

/** A fresh copy of the package (its i18next instance is a module singleton), optionally with an active variant. */
const load = (variantId?: string): { i18nModule: I18nModule; config: ConfigModule } => {
  let i18nModule!: I18nModule;
  let config!: ConfigModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh module registry needs require()
    config = require('@resgrid/config');
    if (variantId) config.setActiveVariant(config.parseVariantManifest(readManifest(variantId)));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh module registry needs require()
    i18nModule = require('../index');
  });
  return { i18nModule, config };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports -- resources looked up by namespace name
const resourcesFor = (ns: string) => require(`../resources/${ns}`)[`${ns}Resources`];

describe('@resgrid/i18n', () => {
  beforeEach(() => {
    rn.Platform.OS = 'ios';
    rn.I18nManager.isRTL = false;
    rn.I18nManager.allowRTL.mockClear();
    rn.I18nManager.forceRTL.mockClear();
    localization.getLocales.mockReturnValue([{ languageCode: 'en', languageTag: 'en-US' }]);
  });

  describe('namespaces', () => {
    it('uses the active variant as default namespace with common as fallback', () => {
      const { i18nModule } = load('unit');
      const i18n = i18nModule.initI18n({ variantResources: resourcesFor('unit') });
      expect(i18n.options.defaultNS).toBe('unit');
      expect([i18n.options.fallbackNS].flat()).toEqual(['common']);
      // Unit keeps its own wording (variant override) ...
      expect(i18n.t('login.login_button')).toBe('Sign In');
      // ... and falls back to common for shared keys.
      expect(i18n.t('common.ok')).toBe('OK');
    });

    it('resolves the same flat key from common for a variant without an override', () => {
      const { i18nModule } = load('responder');
      const i18n = i18nModule.initI18n({ variantResources: resourcesFor('responder') });
      expect(i18n.t('login.login_button')).toBe('Login');
    });

    it('defaults to the common namespace when no variant is active', () => {
      const { i18nModule } = load();
      const i18n = i18nModule.initI18n();
      expect(i18n.options.defaultNS).toBe('common');
      expect(i18n.t('common.cancel')).toBe('Cancel');
    });
  });

  describe('{{appName}}', () => {
    it('interpolates the active variant name by default', () => {
      const { i18nModule } = load('ic');
      const i18n = i18nModule.initI18n({ variantResources: resourcesFor('ic') });
      const name = (readManifest('ic') as { identity: { name: string } }).identity.name;
      expect(i18n.t('app.title')).toBe(name);
      expect(i18n.t('login.subtitle')).toBe(`Enter your credentials to access ${name}`);
    });

    it('accepts an explicit product name and lets callers override per call', () => {
      const { i18nModule } = load();
      const i18n = i18nModule.initI18n({ appName: 'Resgrid Test' });
      expect(i18n.t('app.title')).toBe('Resgrid Test');
      expect(i18n.t('app.title', { appName: 'Other' })).toBe('Other');
    });
  });

  describe('language', () => {
    it('uses a supported stored choice, else the first supported device locale, else English', () => {
      localization.getLocales.mockReturnValue([{ languageCode: 'ja' }, { languageCode: 'pl' }]);
      expect(load().i18nModule.initI18n({ language: 'de' }).language).toBe('de');
      expect(load().i18nModule.initI18n({ language: 'pt' }).language).toBe('pl');
      localization.getLocales.mockReturnValue([{ languageCode: 'ja' }]);
      expect(load().i18nModule.initI18n().language).toBe('en');
    });

    it('switches language, clears the translate cache and notifies subscribers', async () => {
      const { i18nModule } = load();
      i18nModule.initI18n({ language: 'en' });
      expect(i18nModule.translate('common.cancel')).toBe('Cancel');
      const changes: unknown[] = [];
      const off = i18nModule.onLanguageChanged((c) => changes.push(c));

      await i18nModule.setLanguage('de');
      expect(i18nModule.getCurrentLanguage()).toBe('de');
      expect(i18nModule.translate('common.cancel')).toBe('Abbrechen');
      expect(changes).toEqual([{ language: 'de', previous: 'en', isRTL: false, requiresReload: false }]);

      off();
      await i18nModule.setLanguage('fr');
      expect(changes).toHaveLength(1);
    });

    it('translate() interpolates options and memoizes per options', () => {
      const { i18nModule } = load();
      i18nModule.initI18n({ language: 'en' });
      expect(i18nModule.translate('weather_alerts.moreAlerts', { count: 3 })).toBe('+3 more alerts');
      expect(i18nModule.translate('weather_alerts.moreAlerts', { count: 4 })).toBe('+4 more alerts');
    });

    it('rejects unsupported languages and ignores a no-op change', async () => {
      const { i18nModule } = load();
      i18nModule.initI18n({ language: 'en' });
      await expect(i18nModule.setLanguage('pt' as never)).rejects.toThrow('Unsupported language');
      const listener = jest.fn();
      i18nModule.onLanguageChanged(listener);
      await i18nModule.setLanguage('en');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('RTL', () => {
    it('forces RTL for Arabic on native and reports that a reload is needed', async () => {
      const { i18nModule } = load();
      i18nModule.initI18n({ language: 'en' });
      const changes: { requiresReload: boolean; isRTL: boolean }[] = [];
      i18nModule.onLanguageChanged((c) => changes.push(c));

      await i18nModule.setLanguage('ar');
      expect(rn.I18nManager.forceRTL).toHaveBeenLastCalledWith(true);
      expect(rn.I18nManager.allowRTL).toHaveBeenLastCalledWith(true);
      expect(changes[0]).toEqual(expect.objectContaining({ isRTL: true, requiresReload: true }));
      expect(i18nModule.isRTL()).toBe(true);
      expect(i18nModule.translate('common.cancel')).toBe('إلغاء');
    });

    it('applies LTR at init for LTR languages', () => {
      load().i18nModule.initI18n({ language: 'sv' });
      expect(rn.I18nManager.forceRTL).toHaveBeenLastCalledWith(false);
    });

    it('sets dir and lang on the document on web, without a reload', async () => {
      rn.Platform.OS = 'web';
      const documentElement = { dir: '', lang: '' };
      Object.defineProperty(globalThis, 'document', { value: { documentElement }, configurable: true, writable: true });
      const { i18nModule } = load();
      i18nModule.initI18n({ language: 'en' });
      const changes: { requiresReload: boolean }[] = [];
      i18nModule.onLanguageChanged((c) => changes.push(c));

      await i18nModule.setLanguage('ar');
      expect(documentElement).toEqual({ dir: 'rtl', lang: 'ar' });
      expect(changes[0].requiresReload).toBe(false);
      expect(rn.I18nManager.forceRTL).not.toHaveBeenCalled();
      Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true, writable: true });
    });
  });

  it('re-initialising updates language, product name and resources in place', () => {
    const { i18nModule } = load();
    const first = i18nModule.initI18n({ language: 'en', appName: 'One' });
    const second = i18nModule.initI18n({ language: 'it', appName: 'Two', variantId: 'dispatch', variantResources: resourcesFor('dispatch') });
    expect(second).toBe(first);
    expect(second.language).toBe('it');
    expect(second.options.defaultNS).toBe('dispatch');
    expect(second.t('app.title')).toBe('Two');
  });
});
