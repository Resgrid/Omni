import { type QaDepartment } from '../e2e/support/qa-departments';
import { nativeFlow, screenLink } from '../e2e/support/qa-native-flows';
import { loadManifest } from '../e2e/support/variants';

// The QA regression run (e2e/qa-regression.ts) generates one Maestro flow per department and native form factor from
// these rules; the flows themselves only run on simulators and emulators.

const department = (scenario: string, sso: QaDepartment['features']['sso'] = 'none'): QaDepartment => ({
  scenario,
  departmentId: 7,
  name: `QA ${scenario}`,
  purpose: '',
  covers: [],
  timeZone: 'Eastern Standard Time',
  use24HourTime: false,
  features: {
    customStatuses: { personnel: false, staffing: false, unitTypes: [] },
    departmentCallPriorities: false,
    adp: false,
    sso,
    ssoProviders: [],
    mfaRequired: false,
    terminology: {},
    disabledModules: [],
    permissions: [],
    incidentCommand: false,
    empty: false,
  },
  users: [
    { persona: 'admin', username: 'qa-base-admin-t', userId: 'A', name: 'Avery Admin', admin: true, groupAdmin: true, disabled: false, hidden: false, group: null, roles: [], totpSecret: null, alsoMemberOf: [] },
    { persona: 'member', username: 'qa-base-member-t', userId: 'M', name: 'Riley Member', admin: false, groupAdmin: false, disabled: false, hidden: false, group: null, roles: [], totpSecret: null, alsoMemberOf: [] },
  ],
  otherPeople: 0,
  groups: {},
  units: { 'Engine 1': 21 },
  calls: { 'structure-fire': { id: 101, name: 'Structure Fire', state: 'active' } },
  flags: { profile: 'server', overrides: {}, expected: {} },
});

const flow = (variant: 'responder' | 'ic', formFactor: 'phone' | 'tablet', scenario = 'base'): string =>
  nativeFlow({ app: loadManifest(variant), department: department(scenario), formFactor, platform: 'ios', flowDir: '/tmp/qa/flows' }) ?? '';

describe('QA native flows', () => {
  it('runs tablets in landscape and checks the permanent sidebar where the app has one', () => {
    expect(flow('responder', 'tablet')).toContain('- setOrientation: LANDSCAPE_LEFT');
    expect(flow('responder', 'tablet')).toContain('- assertVisible:\n    id: "shell-sidebar-permanent|shell-nav-profile-name"');
    // IC keeps the drawer on tablets.
    expect(flow('ic', 'tablet')).toContain('- assertNotVisible:\n    id: "shell-sidebar-permanent|shell-nav-profile-name"');
  });

  it('runs phones in portrait without the permanent sidebar', () => {
    expect(flow('responder', 'phone')).toContain('- setOrientation: PORTRAIT');
    expect(flow('responder', 'phone')).toContain('- assertNotVisible:\n    id: "shell-sidebar-permanent|shell-nav-profile-name"');
  });

  it('signs in, then opens every signed-in screen by the app scheme, records filled in', () => {
    const responder = loadManifest('responder');
    const text = flow('responder', 'phone');

    expect(text.indexOf('sign-in.yaml')).toBeLessThan(text.indexOf('open-screen.yaml'));
    expect(text).toContain(`SCREEN_URL: ${JSON.stringify(screenLink(responder, '/call/101'))}`);
    expect(text).toContain(`SCREEN_URL: ${JSON.stringify(screenLink(responder, '/units/21'))}`);
    expect(text).not.toMatch(/\[id\]/);
    expect(screenLink(responder, '/home/calls')).toBe(`${responder.identity.schemes[0]}://home/calls`);
  });

  it('skips a department without password sign-in', () => {
    expect(nativeFlow({ app: loadManifest('unit'), department: department('sso-required', 'required'), formFactor: 'phone', platform: 'android', flowDir: '/tmp/qa' })).toBeNull();
  });
});
