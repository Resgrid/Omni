import { initI18n } from '@resgrid/i18n';
import { registerBackgroundLocationBootstrap } from '@resgrid/location';

import { configureAppShell, runBackgroundStartup } from '../configure';
import { startupInit } from '../init/app-init';
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

  it('leaves the background-location bootstrap to the app entry (it must exist before anything mounts)', () => {
    configureAppShell({ variant: activateVariant('unit'), options: { registerDefaultSteps: false } });
    expect(registerBackgroundLocationBootstrap).not.toHaveBeenCalled();
  });

  it('runBackgroundStartup refuses to run before the root layout configured the shell', async () => {
    await expect(runBackgroundStartup()).rejects.toThrow(/not configured/);
  });

  it('runBackgroundStartup runs (or joins) the startup phase and reports a failure', async () => {
    configureAppShell({ variant: activateVariant('unit'), options: { registerDefaultSteps: false } });
    const run = jest.spyOn(startupInit, 'run');
    run.mockResolvedValueOnce({ ...startupInit.getStatus(), state: 'ready' });
    await expect(runBackgroundStartup()).resolves.toBeUndefined();
    run.mockResolvedValueOnce({ ...startupInit.getStatus(), state: 'failed', failedStep: 'startup.offline', error: null });
    await expect(runBackgroundStartup()).rejects.toThrow(/startup\.offline/);
    run.mockRestore();
  });

  it('refuses to switch variants at runtime', () => {
    configureAppShell({ variant: activateVariant('dispatch'), options: { registerDefaultSteps: false } });
    expect(() => configureAppShell({ variant: activateVariant('unit'), options: { registerDefaultSteps: false } })).toThrow(/already configured/);
  });
});
