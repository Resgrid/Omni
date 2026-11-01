import { initI18n } from '@resgrid/i18n';
import { registerBackgroundLocationBootstrap } from '@resgrid/location';

import { configureAppShell } from '../configure';
import { defineNav } from '../nav/define-nav';
import { defineRoutes } from '../routes/define-routes';
import { getHrefBuilders } from '../routes/href';
import { getAppShellConfig, getShellNav, resetAppShellConfigForTests } from '../runtime/shell-config';
import { getShellScreens, resetShellSlotsForTests } from '../runtime/slots';
import { activateVariant } from './helpers/variants';

const nav = defineNav([{ id: 'home', href: '/', placement: 'sidebar', labelKey: 'tabs.home' }]);

describe('configureAppShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAppShellConfigForTests();
    resetShellSlotsForTests();
  });

  it('initialises translations synchronously, before the first render (react-i18next hook order)', () => {
    const variant = activateVariant('dispatch');
    configureAppShell({ variant, nav, options: { registerDefaultSteps: false } });
    expect(initI18n).toHaveBeenCalledWith({ variantResources: undefined });
  });

  it('applies the route contract, nav and gate screens', () => {
    const variant = activateVariant('dispatch');
    const Login = () => null;
    configureAppShell({ variant, nav, routes: defineRoutes(['home', 'callDetail']), screens: { Login }, options: { registerDefaultSteps: false } });

    expect(getAppShellConfig().variant.id).toBe('dispatch');
    expect(getShellNav()).toBe(nav);
    expect(getHrefBuilders().callDetail(9)).toBe('/call/9');
    expect(getShellScreens().Login).toBe(Login);
  });

  it('lets a background location relaunch run startup only where the variant has background location', () => {
    const unit = activateVariant('unit');
    configureAppShell({ variant: unit, options: { registerDefaultSteps: false } });
    expect(registerBackgroundLocationBootstrap).toHaveBeenCalledTimes(unit.capabilities.location.background ? 1 : 0);

    resetAppShellConfigForTests();
    jest.clearAllMocks();
    const bigboard = activateVariant('bigboard');
    configureAppShell({ variant: bigboard, options: { registerDefaultSteps: false } });
    expect(registerBackgroundLocationBootstrap).toHaveBeenCalledTimes(bigboard.capabilities.location.background ? 1 : 0);
  });

  it('refuses to switch variants at runtime', () => {
    configureAppShell({ variant: activateVariant('dispatch'), options: { registerDefaultSteps: false } });
    expect(() => configureAppShell({ variant: activateVariant('unit'), options: { registerDefaultSteps: false } })).toThrow(/already configured/);
  });
});
