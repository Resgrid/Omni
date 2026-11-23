import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';

import flagGatedNavJson from './flag-gated-nav.json';
import { omniRoot, type VariantId } from './variants';

// The seeded QA departments (Core: Docker/qa-departments) the regression suite signs in to. The seeder writes
// qa-departments.json: departments with their scenario, sign-in personas, ids of named records and the state every
// active feature flag should evaluate to. Point E2E_QA_MANIFEST at it; without it the qa-* projects skip.

const QaUserSchema = z.object({
  persona: z.string(),
  username: z.string(),
  userId: z.string(),
  name: z.string(),
  admin: z.boolean(),
  groupAdmin: z.boolean(),
  disabled: z.boolean(),
  hidden: z.boolean(),
  group: z.string().nullable(),
  roles: z.array(z.string()),
  /** Base32 TOTP secret for an MFA-enrolled persona. */
  totpSecret: z.string().nullable(),
  alsoMemberOf: z.array(z.string()),
});

const QaFlagExpectationSchema = z.object({
  /** null when the server decides (rollout, targeting, plan gate, unknown environment). */
  enabled: z.boolean().nullable(),
  source: z.string(),
});

const QaDepartmentSchema = z.object({
  scenario: z.string(),
  departmentId: z.number(),
  name: z.string(),
  purpose: z.string(),
  covers: z.array(z.string()),
  timeZone: z.string(),
  use24HourTime: z.boolean(),
  features: z.object({
    customStatuses: z.object({ personnel: z.boolean(), staffing: z.boolean(), unitTypes: z.array(z.string()) }),
    departmentCallPriorities: z.boolean(),
    adp: z.boolean(),
    sso: z.enum(['none', 'optional', 'required']),
    ssoProviders: z.array(z.string()),
    mfaRequired: z.boolean(),
    terminology: z.record(z.string(), z.union([z.string(), z.object({ text: z.string(), singular: z.string().optional() })])),
    disabledModules: z.array(z.string()),
    permissions: z.array(z.object({ type: z.string(), action: z.string(), roles: z.array(z.string()).optional() })),
    incidentCommand: z.boolean(),
    empty: z.boolean(),
  }),
  users: z.array(QaUserSchema),
  otherPeople: z.number(),
  groups: z.record(z.string(), z.number()),
  units: z.record(z.string(), z.number()),
  /** POI ids by name (seeders before destination capabilities, 2026-11-13, have none). */
  pois: z.record(z.string(), z.number()).default({}),
  calls: z.record(z.string(), z.object({ id: z.number(), name: z.string(), state: z.string() })),
  flags: z.object({
    profile: z.enum(['server', 'all-on', 'all-off']),
    overrides: z.record(z.string(), z.boolean()),
    expected: z.record(z.string(), QaFlagExpectationSchema),
  }),
});

const QaManifestSchema = z.object({
  version: z.literal(1),
  runTag: z.string(),
  apiUrl: z.string().nullable(),
  credentials: z.object({ password: z.string() }),
  departments: z.array(QaDepartmentSchema),
});

export type QaUser = z.infer<typeof QaUserSchema>;

export type QaFlagExpectation = z.infer<typeof QaFlagExpectationSchema>;

export type QaDepartment = z.infer<typeof QaDepartmentSchema>;

export type QaManifest = z.infer<typeof QaManifestSchema>;

export const QA_MANIFEST_ENV = 'E2E_QA_MANIFEST';

let cached: QaManifest | null | undefined;

/** The manifest named by E2E_QA_MANIFEST, or null when the suite runs without a seeded server. */
export function loadQaManifest(env: NodeJS.ProcessEnv = process.env): QaManifest | null {
  if (cached !== undefined) return cached;
  const file = env[QA_MANIFEST_ENV]?.trim();

  if (!file) return (cached = null);
  const parsed = QaManifestSchema.safeParse(JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')));

  if (!parsed.success) throw new Error(`${file} is not a QA departments manifest (version 1): ${parsed.error.message}`);
  const apiUrl = env.E2E_QA_API_URL?.trim() || parsed.data.apiUrl;

  if (!apiUrl) throw new Error(`${file} has no apiUrl; set E2E_QA_API_URL to the API the departments were seeded for.`);

  return (cached = { ...parsed.data, apiUrl });
}

/** `FeatureToggles/GetAll` as the app receives it: `{ Data: [{ Key, Enabled }] }`. */
export const FlagStatesSchema = z.object({ Data: z.array(z.object({ Key: z.string(), Enabled: z.boolean() })).nullable() });

/** Departments to run: E2E_QA_SCENARIOS (comma-separated scenario ids) or all of them. */
export function selectedQaDepartments(manifest: QaManifest, env: NodeJS.ProcessEnv = process.env): QaDepartment[] {
  const wanted = env.E2E_QA_SCENARIOS?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (!wanted?.length) return manifest.departments;
  const unknown = wanted.filter((id) => !manifest.departments.some((d) => d.scenario === id));

  if (unknown.length) throw new Error(`E2E_QA_SCENARIOS: unknown scenarios ${unknown.join(', ')}.`);

  return manifest.departments.filter((d) => wanted.includes(d.scenario));
}

export function persona(department: QaDepartment, id: string): QaUser | undefined {
  return department.users.find((user) => user.persona === id);
}

/** Whether every flag is expected on (true), any is expected off (false), or the server decides one of them (null). */
export function flagsExpected(department: QaDepartment, keys: readonly string[]): boolean | null {
  let all: boolean | null = true;

  for (const key of keys) {
    const expected = department.flags.expected[key];

    if (!expected || expected.enabled === false) return false;

    if (expected.enabled === null) all = null;
  }

  return all;
}

// ---- Routes ------------------------------------------------------------------------------------------------------------

export interface QaRoute {
  /** The route file's path pattern (`/call/[id]`). */
  pattern: string;
  /** The URL to open, or null when the department has no record to fill the route's parameters with. */
  url: string | null;
}

/** Signed-in screens: every route file of the variant's `(app)` group, layouts excluded. */
export function signedInRoutes(variantId: VariantId): string[] {
  const root = path.join(omniRoot, 'variants', variantId, 'app', '(app)');

  const walk = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.tsx') && entry.name !== '_layout.tsx' ? [path.join(dir, entry.name)] : []));

  return walk(root)
    .map(
      (file) =>
        '/' +
        path
          .relative(root, file)
          .replace(/\\/g, '/')
          .replace(/\.tsx$/, '')
    )
    .map((route) => route.replace(/\/index$/, '') || '/')
    .filter((route) => !SIGNED_IN_EXCLUDED.has(route))
    .sort();
}

// Screens that only make sense from a flow (a sign-in approval request), checked by their own flows.
const SIGNED_IN_EXCLUDED = new Set(['/approve-sign-in']);

/** A dynamic route and the department record it opens. */
interface RouteParameter {
  pattern: string;
  value: (department: QaDepartment) => string | number | undefined;
}

/** The baseline destination seeded on diversion, offering Cath Lab (reported unavailable) and Stroke Center (Core: Docker/qa-departments). */
export const QA_DIVERSION_HOSPITAL = "St. John's (QA)";

const PARAMETERS: readonly RouteParameter[] = [
  { pattern: '/call/[id]', value: (d) => d.calls['structure-fire']?.id },
  { pattern: '/call/[id]/edit', value: (d) => d.calls['structure-fire']?.id },
  { pattern: '/calls/[id]', value: (d) => d.calls['structure-fire']?.id },
  { pattern: '/units/[id]', value: (d) => d.units['Engine 1'] },
  { pattern: '/unit/[id]', value: (d) => d.units['Engine 1'] },
  { pattern: '/personnel/[id]', value: (d) => persona(d, 'member')?.userId },
  // The baseline's hospital on diversion with a cath lab down: the detail screen shows its capabilities and availability.
  { pattern: '/poi/[id]', value: (d) => d.pois?.[QA_DIVERSION_HOSPITAL] },
];

export function resolveRoute(pattern: string, department: QaDepartment): QaRoute {
  if (!pattern.includes('[')) return { pattern, url: pattern };
  const value = PARAMETERS.find((parameter) => parameter.pattern === pattern)?.value(department);

  return { pattern, url: value === undefined ? null : pattern.replace(/\[[^\]]+\]/, encodeURIComponent(String(value))) };
}

// ---- Flag-gated navigation ---------------------------------------------------------------------------------------------

export interface FlagGatedNavEntry {
  /** NavEntry id: the sidebar item's testID is `nav-<id>`. */
  id: string;
  flags: string[];
}

/** Sidebar entries each app shows only while their flags are on (kept in sync with nav.ts by apps/omni/__tests__/qa-flag-gated-nav.test.ts). */
export function flagGatedNav(variantId: VariantId): readonly FlagGatedNavEntry[] {
  return FLAG_GATED_NAV[variantId];
}

const FLAG_GATED_NAV = flagGatedNavJson satisfies Record<VariantId, readonly FlagGatedNavEntry[]>;

// ---- TOTP --------------------------------------------------------------------------------------------------------------

/** RFC 6238 code (HMAC-SHA1, 6 digits, 30 s) for an MFA-enrolled persona, as an authenticator app shows it. */
export function totp(secret: string, at: number = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';

  for (const char of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const digest = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;

  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const STEP_MS = 30_000;

// Core accepts a code up to two steps ahead of the clock (and never the same step twice: replay protection).
const MAX_STEPS_AHEAD = 2;

// Each persona's newest used step, shared by every QA run on this machine (web, Electron and native sign-ins).
const totpDir = (): string => path.join(os.tmpdir(), 'resgrid-qa-totp');

const lastStepFile = (username: string): string => path.join(totpDir(), `${username}.step`);

const readLastStep = (file: string): number => (fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : -1);

// A turn holds the lock for at most the wait for a free step (two steps) plus one sign-in (under a minute); a lock older
// than this was left by a worker that was killed during its turn.
const STALE_LOCK_MS = 3 * 60_000;

const isStaleLock = (lock: string): boolean => {
  try {
    return Date.now() - fs.statSync(lock).mtimeMs > STALE_LOCK_MS;
  } catch {
    // Released while we looked: not stale, the next attempt takes it.
    return false;
  }
};

/**
 * Runs `submit` with a TOTP time (ms) whose step no earlier sign-in of this persona used. Core accepts each step once and
 * only above the last one it accepted, and a refused code counts toward the account lockout, so parallel workers signing
 * in as one persona take turns through a lock file and each submits a newer step; when the steps Core still accepts
 * (up to two ahead of the clock) are used up, this waits for the next one.
 */
export async function withTotpTime<T>(username: string, submit: (at: number) => Promise<T>): Promise<T> {
  const dir = totpDir();

  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, `${username}.lock`);
  const last = lastStepFile(username);

  for (;;) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;

      if (isStaleLock(lock)) {
        // Moved aside first, so of several workers that found it stale only one removes it.
        const stale = `${lock}.stale-${process.pid}-${Date.now()}`;

        try {
          fs.renameSync(lock, stale);
          fs.rmSync(stale, { recursive: true, force: true });
        } catch {
          // Another worker moved it aside first.
        }

        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  try {
    for (;;) {
      const now = Math.floor(Date.now() / STEP_MS);
      const used = readLastStep(last);
      const step = Math.max(now, used + 1);

      if (step - now <= MAX_STEPS_AHEAD) {
        fs.writeFileSync(last, String(step));

        return await submit(step * STEP_MS);
      }

      await new Promise((resolve) => setTimeout(resolve, (now + 1) * STEP_MS - Date.now() + 100));
    }
  } finally {
    fs.rmdirSync(lock);
  }
}

// A native sign-in flow (maestro/qa/sign-in.yaml) gets codes for this long: a cold first bundle, the onboarding and a
// relaunch past a system sheet all fit well inside it.
const FLOW_CODE_STEPS = 40;

/** What a native sign-in flow gets as `QA_TOTP`, and the call that records its sign-in once the flow has ended. */
export interface FlowTotpCodes {
  /** `<first step>:<code>,<code>,…`: one code per 30 s step from the first. */
  value: string;
  /** Records the newest step the flow can have submitted, so the persona's next sign-in uses a newer one. */
  done: (end?: number) => void;
}

/**
 * TOTP codes for a native sign-in flow, from the first step no earlier sign-in of this persona used. A flow reaches the
 * code prompt minutes after it starts (two on an Android emulator: the development client's launch, the onboarding),
 * when a code made at its start is past the steps Core accepts, so it types the code for the step it is in at that
 * moment (maestro/qa/totp-code.js picks it; Maestro runs scripts on this machine, on this clock).
 */
export function flowTotpCodes(username: string, secret: string, now: number = Date.now()): FlowTotpCodes {
  fs.mkdirSync(totpDir(), { recursive: true });
  const file = lastStepFile(username);
  const first = Math.max(Math.floor(now / STEP_MS), readLastStep(file) + 1);
  const codes = Array.from({ length: FLOW_CODE_STEPS }, (_, index) => totp(secret, (first + index) * STEP_MS));

  return {
    value: `${first}:${codes.join(',')}`,
    // The flow submits the step it is in when the prompt shows, never before `first`: no newer than the step it ended in.
    done: (end = Date.now()) => fs.writeFileSync(file, String(Math.max(readLastStep(file), first, Math.floor(end / STEP_MS)))),
  };
}

// ---- App access --------------------------------------------------------------------------------------------------------

/** The department permission (Core PermissionTypes) behind each app access right a variant can require. */
const APP_LOGIN_PERMISSIONS = { CanLoginToDispatchApp: 'DispatchAppLogin', CanLoginToCommandApp: 'CommandAppLogin' } as const;

export type AppAccessRight = keyof typeof APP_LOGIN_PERMISSIONS;

/** Who a permission action (Core PermissionActions, as the seeder names them) lets in, given whether the persona has one of its roles. */
const PERMISSION_ACTIONS = {
  everyone: () => true,
  departmentAdminsOnly: (user) => user.admin,
  departmentAndGroupAdmins: (user) => user.admin || user.groupAdmin,
  departmentAdminsAndSelectRoles: (user, hasRole) => user.admin || hasRole,
  departmentAndGroupAdminsAndSelectRoles: (user, hasRole) => user.admin || user.groupAdmin || hasRole,
} satisfies Record<string, (user: QaUser, hasRole: boolean) => boolean>;

type PermissionAction = keyof typeof PERMISSION_ACTIONS;

const isPermissionAction = (action: string): action is PermissionAction => Object.keys(PERMISSION_ACTIONS).includes(action);

/** What `mayUseApp` reads of a department. */
export interface AppLoginRules {
  scenario: string;
  features: { permissions: QaDepartment['features']['permissions'] };
}

/**
 * Whether the department lets this persona sign in to an app that requires `right` (`capabilities.auth.appAccessRight`:
 * Dispatch, IC), as Core decides it from the seeded DispatchAppLogin / CommandAppLogin permission. Without the right or
 * the permission everyone is let in.
 */
export function mayUseApp(department: AppLoginRules, user: QaUser, right: AppAccessRight | null): boolean {
  if (!right) return true;
  const permission = department.features.permissions.find((entry) => entry.type === APP_LOGIN_PERMISSIONS[right]);

  if (!permission) return true;

  if (!isPermissionAction(permission.action)) throw new Error(`${department.scenario}: permission action ${permission.action} is new to the QA suite; add it to PERMISSION_ACTIONS.`);
  const hasRole = (permission.roles ?? []).some((role) => user.roles.includes(role));

  return PERMISSION_ACTIONS[permission.action](user, hasRole);
}
