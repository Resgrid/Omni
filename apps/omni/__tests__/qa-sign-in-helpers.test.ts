import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

import { type AppLoginRules, flowTotpCodes, mayUseApp, type QaUser, totp } from '../e2e/support/qa-departments';

// How the QA regression run (e2e/qa-regression.ts, e2e/qa) signs personas in: the authenticator codes a native flow gets
// and the Maestro script that types one (e2e/maestro/qa/totp-code.js), and who a department lets into Dispatch and IC.
// The runs themselves need a seeded QA server.

const SECRET = 'JBSWY3DPEHPK3PXP';
const STEP_MS = 30_000;
const USERNAME = `qa-unit-test-${process.pid}`;
const stepFile = path.join(os.tmpdir(), 'resgrid-qa-totp', `${USERNAME}.step`);
const pickerScript = fs.readFileSync(path.join(__dirname, '..', 'e2e', 'maestro', 'qa', 'totp-code.js'), 'utf8');

/** What totp-code.js hands back to the flow. */
interface PickerOutput {
  qaTotp?: string;
}

/** The code totp-code.js types at `at`, run as Maestro runs it: QA_TOTP a global, the result on `output`. */
function typedCode(qaTotp: string, at: number): string | undefined {
  const output: PickerOutput = {};

  vm.runInNewContext(pickerScript, { QA_TOTP: qaTotp, output, Date: { now: () => at } });

  return output.qaTotp;
}

afterEach(() => fs.rmSync(stepFile, { force: true }));

describe('native flow TOTP codes', () => {
  const now = 1_790_000_000_000;
  const nowStep = Math.floor(now / STEP_MS);

  it('gives one code per step for 20 minutes, from the step the flow starts in', () => {
    const [first, list] = flowTotpCodes(USERNAME, SECRET, now).value.split(':');
    const codes = list?.split(',') ?? [];

    expect(Number(first)).toBe(nowStep);
    expect(codes).toHaveLength(40);
    expect(codes[0]).toBe(totp(SECRET, nowStep * STEP_MS));
    expect(codes[39]).toBe(totp(SECRET, (nowStep + 39) * STEP_MS));
  });

  it('starts after the newest step any sign-in of the persona used, and records the flow’s own', () => {
    fs.mkdirSync(path.dirname(stepFile), { recursive: true });
    // A web sign-in a moment ago used a step ahead of the clock (Core takes up to two).
    fs.writeFileSync(stepFile, String(nowStep + 2));
    const codes = flowTotpCodes(USERNAME, SECRET, now);

    expect(codes.value.startsWith(`${nowStep + 3}:`)).toBe(true);

    // The flow ended four minutes later: it can have submitted any step up to that one.
    codes.done(now + 4 * 60_000);
    expect(Number(fs.readFileSync(stepFile, 'utf8'))).toBe(nowStep + 8);
    expect(flowTotpCodes(USERNAME, SECRET, now + 4 * 60_000).value.startsWith(`${nowStep + 9}:`)).toBe(true);
  });

  it('types the code for the step the flow is in when the prompt shows, minutes after it started', () => {
    const { value } = flowTotpCodes(USERNAME, SECRET, now);
    // Two minutes and ten seconds in, as on an Android emulator.
    const atPrompt = now + 130_000;

    expect(typedCode(value, atPrompt)).toBe(totp(SECRET, atPrompt));
    // Before the first step (a clock that moved back): the first code; past the last: the last.
    expect(typedCode(value, now - 90_000)).toBe(totp(SECRET, now));
    expect(typedCode(value, now + 60 * 60_000)).toBe(totp(SECRET, (nowStep + 39) * STEP_MS));
  });

  it('passes "none" through for a persona without an authenticator', () => {
    expect(typedCode('none', now)).toBe('none');
  });
});

describe('mayUseApp', () => {
  const user = (persona: string, roles: string[], admin = false, groupAdmin = false): QaUser => ({
    persona,
    username: `qa-restricted-${persona}-t`,
    userId: persona,
    name: persona,
    admin,
    groupAdmin,
    disabled: false,
    hidden: false,
    group: null,
    roles,
    totpSecret: null,
    alsoMemberOf: [],
  });

  // Core: Docker/qa-departments/catalog/scenarios/restricted.json.
  const restricted: AppLoginRules = {
    scenario: 'restricted',
    features: {
      permissions: [
        { type: 'CreateCall', action: 'departmentAdminsAndSelectRoles', roles: ['Dispatcher'] },
        { type: 'DispatchAppLogin', action: 'departmentAdminsAndSelectRoles', roles: ['Dispatcher'] },
        { type: 'CommandAppLogin', action: 'departmentAdminsAndSelectRoles', roles: ['Officer'] },
      ],
    },
  };

  const admin = user('admin', ['Officer'], true, true);
  const officer = user('officer', ['Officer', 'Firefighter'], false, true);
  const member = user('member', ['Firefighter', 'EMT']);
  const dispatcher = user('dispatcher', ['Dispatcher']);

  it('lets admins and the listed roles into Dispatch and IC, and keeps everyone else out', () => {
    expect([admin, officer, member, dispatcher].map((u) => mayUseApp(restricted, u, 'CanLoginToDispatchApp'))).toEqual([true, false, false, true]);
    expect([admin, officer, member, dispatcher].map((u) => mayUseApp(restricted, u, 'CanLoginToCommandApp'))).toEqual([true, true, false, false]);
  });

  it('lets everyone into an app with no access right, or a department with no app-login permission', () => {
    expect(mayUseApp(restricted, member, null)).toBe(true);
    expect(mayUseApp({ scenario: 'base', features: { permissions: [] } }, member, 'CanLoginToDispatchApp')).toBe(true);
  });

  it('fails loudly on a permission action the suite does not know yet', () => {
    const department: AppLoginRules = { scenario: 'future', features: { permissions: [{ type: 'DispatchAppLogin', action: 'everyoneButInterns' }] } };

    expect(() => mayUseApp(department, member, 'CanLoginToDispatchApp')).toThrow(/everyoneButInterns/);
  });
});
