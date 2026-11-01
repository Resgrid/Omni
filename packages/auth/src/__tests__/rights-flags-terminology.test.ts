import { FeatureFlagKeys, featureFlagsStore, getFeatureFlagStatus, isFeatureEnabled, recordsFieldFlagKey } from '../flags/feature-flags-store';
import { checkAppAccess, enforceAppAccess, requiredAppAccessRight } from '../rights/app-access';
import { getActiveDepartmentId, resetSecurity, securityStore } from '../rights/security-store';
import { refreshEngine, useAuthStore } from '../session/auth-store';
import { loadSessionGates } from '../session-gates';
import { definitionTermKey, getTerm, recordTypeTermKey, terminologyStore, TermKeys } from '../terminology/terminology-store';
import { v4 } from './helpers/fake-server';
import { flush, type Harness, setupHarness } from './helpers/harness';
import { tokenResponse } from './helpers/jwt';

const rights = (overrides: Record<string, unknown> = {}) => ({
  DepartmentName: 'Station 1',
  DepartmentCode: 'ST1',
  FullName: 'Member One',
  EmailAddress: 'm@example.com',
  DepartmentId: '10',
  IsAdmin: false,
  CanViewPII: true,
  CanCreateCalls: true,
  CanAddNote: true,
  CanCreateMessage: false,
  CanLoginToDispatchApp: true,
  CanLoginToCommandApp: true,
  Groups: [{ GroupId: 3, IsGroupAdmin: true }],
  ...overrides,
});

const signIn = async (h: Harness): Promise<void> => {
  h.server.on('POST', '/connect/token', { data: tokenResponse() });
  await useAuthStore.getState().login({ username: 'member', password: 'secret' });
};

describe('rights (kept offline, re-scoped on a department change)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = setupHarness('unit');
    await signIn(h);
  });
  afterEach(() => refreshEngine.endSession());

  it('persists the rights under the frozen store name and re-scopes the API cache to the department', async () => {
    h.server.on('GET', '/Security/GetCurrentUsersRights', { data: v4(rights()) });
    await securityStore.getState().getRights();
    expect(getActiveDepartmentId()).toBe('10');
    expect(JSON.parse(h.storage.main.getString('security-storage') ?? '{}').state.rights.DepartmentCode).toBe('ST1');
    expect(h.apiCache.setScope).toHaveBeenLastCalledWith({ departmentId: '10' });

    h.server.on('GET', '/Security/GetCurrentUsersRights', { data: v4(rights({ DepartmentId: '11' })) });
    await securityStore.getState().getRights();
    expect(h.apiCache.setScope).toHaveBeenLastCalledWith({ departmentId: '11' });
  });

  it('keeps the last rights when a refresh fails offline or on a server error (Responder nulled them)', async () => {
    h.server.on('GET', '/Security/GetCurrentUsersRights', { data: v4(rights()) });
    await securityStore.getState().getRights();
    h.server.on('GET', '/Security/GetCurrentUsersRights', { network: true });
    await securityStore.getState().getRights();
    expect(securityStore.getState()).toMatchObject({ rights: { DepartmentId: '10' }, error: 'network_error' });
    h.server.on('GET', '/Security/GetCurrentUsersRights', { status: 500 });
    await securityStore.getState().getRights();
    expect(securityStore.getState().rights?.DepartmentId).toBe('10');
  });

  it('drops an answer that lands after sign-out reset the store (generation guard)', async () => {
    let release: () => void = () => undefined;
    h.server.on('GET', '/Security/GetCurrentUsersRights', () => new Promise((resolve) => (release = () => resolve({ data: v4(rights()) }))));
    const loading = securityStore.getState().getRights();
    await flush(10);
    resetSecurity();
    release();
    await loading;
    expect(securityStore.getState().rights).toBeNull();
  });

  it('restores persisted rights at launch so gating works offline', async () => {
    resetSecurity();
    h.storage.main.set('security-storage', JSON.stringify({ state: { rights: rights({ DepartmentId: '77' }) }, version: 0 }));
    await securityStore.persist.rehydrate();
    expect(getActiveDepartmentId()).toBe('77');
    expect(securityStore.getState().isLoaded).toBe(true);
  });

  it("reads Dispatch's rights from its dedicated 'security-storage' instance", async () => {
    const d = setupHarness('dispatch', { seed: { 'security-storage': { 'security-storage': JSON.stringify({ state: { rights: rights({ DepartmentId: '5' }) }, version: 0 }) } } });
    await securityStore.persist.rehydrate();
    expect(getActiveDepartmentId()).toBe('5');
    expect(d.storage.main.getString('security-storage')).toBeUndefined();
  });
});

describe('feature flags (unknown = disabled, fetched after rights)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = setupHarness('unit');
    await signIn(h);
  });
  afterEach(() => refreshEngine.endSession());

  it('treats unknown flags as disabled, before and after loading', async () => {
    expect(isFeatureEnabled(FeatureFlagKeys.ChatSystem)).toBe(false);
    expect(getFeatureFlagStatus(featureFlagsStore.getState(), 'Chat.System')).toBe('unknown');
    h.server.on('GET', '/Security/GetCurrentUsersRights', { data: v4(rights()) });
    h.server.on('GET', '/FeatureToggles/GetAll', {
      data: v4([
        { Key: 'Chat.System', Enabled: true },
        { Key: 'Records.System', Enabled: false },
      ]),
    });
    await featureFlagsStore.getState().fetchFlags();
    expect(isFeatureEnabled('Chat.System')).toBe(true);
    expect(isFeatureEnabled('Records.System')).toBe(false);
    expect(isFeatureEnabled('Never.Heard.Of')).toBe(false);
    expect(getFeatureFlagStatus(featureFlagsStore.getState(), 'Never.Heard.Of')).toBe('disabled');
  });

  it('fetches the rights first, so flags are keyed by user AND department (Unit fetched them in parallel)', async () => {
    h.server.on('GET', '/Security/GetCurrentUsersRights', { data: v4(rights()) });
    h.server.on('GET', '/FeatureToggles/GetAll', { data: v4([{ Key: 'Chat.System', Enabled: true }]) });
    await featureFlagsStore.getState().fetchFlags();
    const order = h.server.requests.map((r) => r.url).filter((url) => url !== '/connect/token');
    expect(order).toEqual(['/Security/GetCurrentUsersRights', '/FeatureToggles/GetAll']);
    expect(featureFlagsStore.getState().identityKey).toBe('user-1:10');
  });

  it('keeps persisted flags offline, but never another identity’s', async () => {
    h.server.on('GET', '/Security/GetCurrentUsersRights', { data: v4(rights()) });
    await securityStore.getState().getRights();
    featureFlagsStore.setState({ flags: { 'Chat.System': { enabled: true } }, isLoaded: true, identityKey: 'user-1:10' });
    h.server.on('GET', '/FeatureToggles/GetAll', { network: true });
    await featureFlagsStore.getState().fetchFlags();
    expect(isFeatureEnabled('Chat.System')).toBe(true);

    featureFlagsStore.setState({ flags: { 'Chat.System': { enabled: true } }, isLoaded: true, identityKey: 'someone-else:10' });
    await featureFlagsStore.getState().fetchFlags();
    expect(isFeatureEnabled('Chat.System')).toBe(false);
  });

  it('knows each variant’s Field Records flag', () => {
    expect(recordsFieldFlagKey('responder')).toBe('Records.Field.Responder');
    expect(recordsFieldFlagKey('unit')).toBe('Records.Field.Unit');
    expect(recordsFieldFlagKey('ic')).toBe('Records.Field.IncidentCommand');
    expect(recordsFieldFlagKey('dispatch')).toBe('Records.Field.Dispatch');
    expect(recordsFieldFlagKey('bigboard')).toBeNull();
  });

  it('loadSessionGates: rights, then flags + terminology + data protection together', async () => {
    h.server.on('GET', '/Security/GetCurrentUsersRights', { data: v4(rights()) });
    h.server.on('GET', '/FeatureToggles/GetAll', { data: v4([]) });
    h.server.on('GET', '/Config/GetTerminology', { data: v4([]) });
    h.server.on('GET', '/DataProtection/Capabilities', { data: v4({ IsProtectionEnabled: true, StepUpWindowMinutes: 10 }) });
    await expect(loadSessionGates()).resolves.toEqual({ appAccess: 'allowed' });
    const urls = h.server.requests.map((r) => r.url).filter((url) => url !== '/connect/token');
    expect(urls[0]).toBe('/Security/GetCurrentUsersRights');
    expect(urls.slice(1).sort()).toEqual(['/Config/GetTerminology', '/DataProtection/Capabilities', '/FeatureToggles/GetAll']);
  });
});

describe('terminology (Unit)', () => {
  let h: Harness;
  beforeEach(async () => {
    h = setupHarness('unit');
    await signIn(h);
    h.server.on('GET', '/Security/GetCurrentUsersRights', { data: v4(rights()) });
    await securityStore.getState().getRights();
  });
  afterEach(() => refreshEngine.endSession());

  it('uses the department’s names where renamed and the app’s own otherwise', async () => {
    h.server.on('GET', '/Config/GetTerminology', {
      data: v4([
        { Key: TermKeys.Calls, Category: 'Module', DefaultName: 'Calls', Name: ' Incidents ' },
        { Key: TermKeys.Units, Category: 'Module', DefaultName: 'Units', Name: null },
        { Key: 'record-type.run', Category: 'RecordType', DefaultName: 'Run', Name: 'Run Report' },
      ]),
    });
    await terminologyStore.getState().fetchTerminology();
    expect(getTerm(TermKeys.Calls, 'Calls')).toBe('Incidents');
    expect(getTerm(TermKeys.Units, 'Units')).toBe('Units');
    expect(getTerm(recordTypeTermKey(1), 'Run')).toBe('Run Report');
    expect(getTerm(null, 'Fallback')).toBe('Fallback');
  });

  it('maps built-in record types and definitions to their term keys', () => {
    expect(recordTypeTermKey(8)).toBe('record-type.unit-activity');
    expect(recordTypeTermKey(3)).toBeNull();
    expect(definitionTermKey('system.training')).toBe('record-type.training');
    expect(definitionTermKey('dept.custom')).toBeNull();
  });

  it('keeps the persisted names when offline, and a reset drops an answer still in flight', async () => {
    terminologyStore.setState({ names: { [TermKeys.Calls]: 'Jobs' }, identityKey: 'user-1:10' });
    h.server.on('GET', '/Config/GetTerminology', { network: true });
    await terminologyStore.getState().fetchTerminology();
    expect(getTerm(TermKeys.Calls, 'Calls')).toBe('Jobs');

    let release: () => void = () => undefined;
    h.server.on('GET', '/Config/GetTerminology', () => new Promise((resolve) => (release = () => resolve({ data: v4([{ Key: TermKeys.Calls, Name: 'Old dept' }]) }))));
    const loading = terminologyStore.getState().fetchTerminology();
    await flush(10);
    terminologyStore.getState().reset();
    release();
    await loading;
    expect(getTerm(TermKeys.Calls, 'Calls')).toBe('Calls');
  });
});

describe('app access gate (capabilities.auth.appAccessRight)', () => {
  afterEach(() => refreshEngine.endSession());

  it('requires CanLoginToCommandApp in IC and CanLoginToDispatchApp in Dispatch; others need nothing', () => {
    setupHarness('ic');
    expect(requiredAppAccessRight()).toBe('CanLoginToCommandApp');
    setupHarness('dispatch');
    expect(requiredAppAccessRight()).toBe('CanLoginToDispatchApp');
    setupHarness('responder');
    expect(requiredAppAccessRight()).toBeNull();
    expect(checkAppAccess(null)).toBe('allowed');
  });

  it('denies only on an explicit false; missing rights or an old server leave the session alone', () => {
    setupHarness('ic');
    expect(checkAppAccess(rights({ CanLoginToCommandApp: false }) as never)).toBe('denied');
    expect(checkAppAccess(rights() as never)).toBe('allowed');
    expect(checkAppAccess({ ...rights(), CanLoginToCommandApp: undefined } as never)).toBe('allowed');
    expect(checkAppAccess(null)).toBe('unknown');
  });

  it('signs a denied member straight back out', async () => {
    const h = setupHarness('dispatch');
    await signIn(h);
    h.server.on('GET', '/Security/GetCurrentUsersRights', { data: v4(rights({ CanLoginToDispatchApp: false })) });
    await securityStore.getState().getRights();
    const onDenied = jest.fn();
    await expect(enforceAppAccess(onDenied)).resolves.toBe(true);
    expect(onDenied).toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', error: 'app_access_denied' });
  });
});
