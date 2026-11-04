// The release regression run of one app on every platform, against seeded QA departments:
//
//   pnpm qa:regression <variant> [--platforms web,electron,ios,android] [--scenarios base,flags-on,...]
//
// 1. Stands up the isolated QA stack from the Core checkout (Docker/qa-departments/stack/qa-stack.py up: Core built
//    from source, a fresh database migrated by Core, the QA departments seeded and verified) and reads its manifest.
// 2. web       exports the app for the web and runs e2e/qa (Playwright, Chromium) against it.
// 3. electron  runs the same suite in the desktop shell (apps/desktop) serving that export (e2e/qa-desktop).
// 4. ios       builds the development client, installs it on an iPhone and an iPad simulator, starts Metro pointed at the
//              QA API, and runs generated Maestro flows: every signed-in screen of every department, the phone in
//              portrait and the tablet in landscape (Responder and Unit tablets must show their permanent sidebar).
// 5. android   the same on a phone and a tablet emulator (the tablet AVD is created from the phone's system image).
//
// Reports, screenshots and generated flows: apps/omni/e2e/qa-output/<variant>/<run>/ (summary.json at the top). The
// stack keeps running for the next run; stop it with `pnpm qa:stack down`.
//
// Options:
//   --platforms <list>      web,electron,ios,android (default: all four)
//   --scenarios <list>      QA departments to run (default: every one in the manifest)
//   --core <dir>            the Core checkout (default: QA_CORE_DIR or ../Core)
//   --stack <up|reuse|skip> up: build and start (default); reuse: start without rebuilding Core; skip: already running
//   --workers <n>           Playwright workers for web (default 2)
//   --metro-port <port>     Metro for the native builds (default 8091, apart from a dev server on 8081)
//   --ios-phone <name>      simulator names (defaults: newest "iPhone 17" / "iPad Pro 11-inch" style devices)
//   --ios-tablet <name>
//   --android-phone <avd>   AVD names (defaults: the first phone AVD / Resgrid_QA_Tablet, created when missing)
//   --android-tablet <avd>
//   --form-factors <list>   phone,tablet for the native legs (default both)
//   --keep-devices          leave simulators and emulators this run booted running
//   --allow-app-errors      report console errors of the native apps without failing their legs
//   --settle-ms <ms>        time each screen gets before the next opens (default 1500)
import { type ChildProcess, spawn, spawnSync, type SpawnSyncOptions } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { loadQaManifest, persona, type QaDepartment, type QaManifest, selectedQaDepartments, totp } from './support/qa-departments';
import { nativeFlow, type NativeFormFactor } from './support/qa-native-flows';
import { isVariantId, loadManifest, omniRoot, repoRoot, type VariantId, type VariantManifest } from './support/variants';

const PLATFORMS = ['web', 'electron', 'ios', 'android'] as const;

type Platform = (typeof PLATFORMS)[number];

type FormFactor = NativeFormFactor;

interface Leg {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  seconds: number;
  report: string;
  detail?: string;
}

// The QA stack's http doors for native development builds (Docker/qa-departments/stack/gateway.conf).
const NATIVE_API_URL = 'http://localhost:5450';
const NATIVE_PORTS = [5450, 5451];
const TABLET_AVD = 'Resgrid_QA_Tablet';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    platforms: { type: 'string', default: PLATFORMS.join(',') },
    scenarios: { type: 'string' },
    core: { type: 'string', default: process.env.QA_CORE_DIR || path.join(repoRoot, '..', 'Core') },
    stack: { type: 'string', default: 'up' },
    workers: { type: 'string', default: '2' },
    'metro-port': { type: 'string', default: '8091' },
    'ios-phone': { type: 'string' },
    'ios-tablet': { type: 'string' },
    'android-phone': { type: 'string' },
    'android-tablet': { type: 'string', default: TABLET_AVD },
    'form-factors': { type: 'string', default: 'phone,tablet' },
    'keep-devices': { type: 'boolean', default: false },
    'allow-app-errors': { type: 'boolean', default: false },
    'settle-ms': { type: 'string', default: '1500' },
  },
});

// What cleanUp() stops. Declared before the argument checks below: their fail() calls cleanUp() while this module is
// still evaluating, and reading these any later would throw (temporal dead zone) instead of printing the usage error.
const started: ChildProcess[] = [];
const bootedDevices: (() => void)[] = [];

const variantArg = positionals[0] ?? process.env.APP_VARIANT ?? '';

if (!isVariantId(variantArg)) fail(`usage: pnpm qa:regression <responder|unit|ic|dispatch|bigboard> [options] (got "${variantArg}")`);

const variant: VariantId = variantArg;
const platforms = values.platforms.split(',').map((p) => p.trim());
const unknownPlatforms = platforms.filter((p) => !PLATFORMS.some((known) => known === p));

if (unknownPlatforms.length) fail(`--platforms: unknown ${unknownPlatforms.join(', ')}; use ${PLATFORMS.join(', ')}`);

const wants = (platform: Platform): boolean => platforms.includes(platform);
const formFactors = values['form-factors'].split(',').map((f) => f.trim());
const wantsFormFactor = (formFactor: FormFactor): boolean => formFactors.includes(formFactor);
const core = path.resolve(values.core);
const stackScript = path.join(core, 'Docker', 'qa-departments', 'stack', 'qa-stack.py');
const manifestFile = path.join(core, 'Docker', 'qa-departments', 'stack', 'private', 'out', 'qa-departments.json');
const metroPort = Number(values['metro-port']);
const settleMs = values['settle-ms'];
const runDir = path.join(omniRoot, 'e2e', 'qa-output', variant, new Date().toISOString().replace(/[:.]/g, '-'));
const exportRoot = path.join(runDir, 'export');
const app: VariantManifest = loadManifest(variant);

// adb 37's mDNS discovery (its Rust bridge) aborts the adb server on some service names it parses, every few seconds once
// an emulator is up here; installs then fail and Maestro loses the device. The suite only uses emulators, so every adb
// server this run starts, or that restarts after a crash, comes up without mDNS.
process.env.ADB_MDNS = '0';

// CocoaPods (inside the iOS build) refuses to run without a UTF-8 locale, which non-interactive shells often lack.
const NATIVE_ENV: NodeJS.ProcessEnv = { ...process.env, LANG: process.env.LANG || 'en_US.UTF-8', LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8' };
const legs: Leg[] = [];

function fail(message: string): never {
  console.error(`qa-regression: ${message}`);
  // process.exit skips main's finally: stop Metro and the devices this run started here.
  cleanUp();
  process.exit(2);
}

function log(message: string): void {
  console.log(`\n━━ ${message}`);
}

function run(command: string, args: string[], options: SpawnSyncOptions = {}): number {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });

  if (result.error) console.error(`${command} could not start: ${result.error.message}`);

  return result.status ?? 1;
}

function output(command: string, args: string[], options: SpawnSyncOptions = {}): string {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });

  return result.status === 0 ? String(result.stdout).trim() : '';
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(what: string, check: () => boolean | Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(2000);
  }

  fail(`timed out waiting for ${what}`);
}

async function leg(name: string, report: string, body: () => Promise<number | string>): Promise<void> {
  log(name);
  const start = Date.now();
  let status: Leg['status'] = 'failed';
  let detail: string | undefined;

  try {
    const result = await body();

    if (result === 0) status = 'passed';
    else if (result === 'skipped') status = 'skipped';
    else detail = `exit ${result}`;
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }

  const entry: Leg = { name, status, seconds: Math.round((Date.now() - start) / 1000), report: path.relative(repoRoot, report) };

  if (detail) entry.detail = detail;
  legs.push(entry);
}

// ---- Preflight: every tool a requested platform needs, before anything starts ----------------------------------------

const maestroCli = (): string | null => {
  for (const candidate of ['maestro', path.join(os.homedir(), '.maestro', 'bin', 'maestro')]) {
    if (spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0) return candidate;
  }

  return null;
};

const androidSdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'Library', 'Android', 'sdk');
const adb = path.join(androidSdk, 'platform-tools', 'adb');
const emulatorBin = path.join(androidSdk, 'emulator', 'emulator');
const avdmanager = [path.join(androidSdk, 'cmdline-tools', 'latest', 'bin', 'avdmanager')].find((file) => fs.existsSync(file)) ?? 'avdmanager';
const missing: string[] = [];

if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) missing.push('Docker (running) for the QA stack');

if (values.stack !== 'skip' && !fs.existsSync(stackScript)) missing.push(`the Core checkout with Docker/qa-departments (looked in ${core}; set --core or QA_CORE_DIR)`);

if ((wants('ios') || wants('android')) && !maestroCli()) missing.push('Maestro for the ios/android legs (https://maestro.mobile.dev: curl -Ls "https://get.maestro.mobile.dev" | bash)');

if (wants('ios') && (process.platform !== 'darwin' || spawnSync('xcrun', ['simctl', 'help'], { stdio: 'ignore' }).status !== 0)) missing.push('Xcode with simulators for the ios leg (a Mac)');

if (wants('android') && (!fs.existsSync(adb) || !fs.existsSync(emulatorBin))) missing.push(`the Android SDK platform-tools and emulator for the android leg (looked in ${androidSdk}; set ANDROID_HOME)`);

if (missing.length) fail(`missing:\n  - ${missing.join('\n  - ')}`);

// ---- 1. The QA stack and its manifest ---------------------------------------------------------------------------------

function stack(): QaManifest {
  if (values.stack !== 'skip') {
    log(`QA stack (${path.relative(repoRoot, core) || core})`);
    const status = run('python3', [stackScript, 'up', ...(values.stack === 'reuse' ? ['--no-build'] : [])]);

    // `up` ends with verify; a failed verification is reported, not fatal: the app suites show what it means.
    if (status !== 0 && !fs.existsSync(manifestFile)) fail('the QA stack did not come up');
    // Sign-in lockouts left by an interrupted run would fail the first sign-ins here.
    run('python3', [stackScript, 'unlock'], { stdio: 'ignore' });
  }

  const manifest = loadQaManifest({ ...process.env, E2E_QA_MANIFEST: manifestFile });

  if (!manifest) fail(`no QA manifest at ${manifestFile}`);

  return manifest;
}

// ---- 2-3. Web and Electron (Playwright) ------------------------------------------------------------------------------

function webExport(): number {
  log(`Web export (${variant})`);

  return run('pnpm', ['--filter', '@resgrid/omni', 'web:export'], { env: { ...process.env, APP_VARIANT: variant, WEB_EXPORT_DIR: path.join(exportRoot, variant) } });
}

function playwright(project: string, out: string, workers: string): number {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    E2E_QA_MANIFEST: manifestFile,
    E2E_WEB_EXPORT_ROOT: exportRoot,
    E2E_WEB_PORT: '19300',
    E2E_VARIANT: variant,
    E2E_QA_SETTLE_MS: settleMs,
    PLAYWRIGHT_JUNIT_OUTPUT_FILE: path.join(out, 'junit.xml'),
  };

  if (values.scenarios) env.E2E_QA_SCENARIOS = values.scenarios;

  return run('node', ['scripts/ci/run-playwright.mjs', 'test', '-c', 'apps/omni/e2e/playwright.config.ts', '--project', project, '--workers', workers, '--output', path.join(out, 'results'), '--reporter', 'list,junit'], {
    cwd: repoRoot,
    env,
  });
}

// ---- 4-5. Native (development client + Metro + generated Maestro flows) ----------------------------------------------

/** Writes one department's flow for one form factor (support/qa-native-flows.ts); null when it has no password sign-in. */
function writeFlow(dir: string, department: QaDepartment, formFactor: FormFactor, platform: 'ios' | 'android'): string | null {
  const flow = nativeFlow({ app, department, formFactor, platform, flowDir: dir });

  if (!flow) return null;
  const file = path.join(dir, `${department.scenario}.yaml`);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, flow);

  return file;
}

// Core accepts each TOTP step once and only above the last it accepted: every sign-in of a persona gets a newer step,
// one ahead of the clock so the code is still good when the flow reaches the prompt.
const lastStep = new Map<string, number>();

function freshTotp(username: string, secret: string): string {
  const step = Math.max(Math.floor(Date.now() / 30_000) + 1, (lastStep.get(username) ?? 0) + 1);

  lastStep.set(username, step);

  return totp(secret, step * 30_000);
}

// Console errors of the native apps that the QA stack itself causes, with why. Everything else fails the leg.
const EXPLAINED_APP_ERRORS: readonly { pattern: RegExp; why: string }[] = [
  {
    pattern: /MapLibre Native \[ERROR\][\s\S]*(api\.maptiler\.com|Failed to load tile \S+ for source resgrid-raster)/,
    why: 'The QA stack configures no MapTiler key, so the base map (raster source resgrid-raster) has its tiles refused or reset; markers and the map itself still render.',
  },
];

const metroLog = (): string => path.join(runDir, 'metro.log');

// Colours and the cursor moves Metro's progress line uses; text a carriage return overwrote goes too.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]|[^\\n]*\\r(?!\\n)`, 'g');

/**
 * Bundles Metro could not build from `from` on, each with the reason on the line after (a module another change added
 * after Metro started, a syntax error): the dev client then sits on its splash or error screen and every flow times out.
 */
function bundleFailuresSince(from: number): string[] {
  const lines = fs.readFileSync(metroLog(), 'utf8').slice(from).replace(ANSI, '').split('\n');

  return lines.flatMap((line, index) => (/Bundling failed/.test(line) ? [`${line.trim()}: ${lines[index + 1]?.trim() ?? ''}`] : []));
}

/** The ERROR blocks Metro printed from `from` on (development builds forward console.error and LogBox errors to Metro). */
function appErrorsSince(from: number): string[] {
  const text = fs.readFileSync(metroLog(), 'utf8').slice(from).replace(ANSI, '');
  const blocks: string[] = [];
  let current: string[] | null = null;

  for (const line of text.split('\n')) {
    const marker = /^\s*(LOG|WARN|INFO|ERROR)\b/.exec(line)?.[1];

    if (marker) {
      if (current) blocks.push(current.join('\n').trim());
      current = marker === 'ERROR' ? [line] : null;
    } else if (current && current.length < 40) current.push(line);
  }

  if (current) blocks.push(current.join('\n').trim());

  return blocks;
}

async function maestroLeg(platform: 'ios' | 'android', formFactor: FormFactor, device: string, manifest: QaManifest): Promise<number> {
  const out = path.join(runDir, `${platform}-${formFactor}`);
  const logStart = fs.existsSync(metroLog()) ? fs.statSync(metroLog()).size : 0;
  let failures = 0;

  for (const department of selectedQaDepartments(manifest, { ...process.env, E2E_QA_SCENARIOS: values.scenarios })) {
    const flow = writeFlow(path.join(out, 'flows'), department, formFactor, platform);
    const admin = persona(department, 'admin');

    if (!flow || !admin) continue;
    console.log(`  ${department.scenario} (${admin.username})`);

    const status = run('node', [
      path.join(omniRoot, 'e2e', 'maestro', 'run-maestro.mjs'),
      '--variant',
      variant,
      '--platform',
      platform,
      '--app-env',
      'development',
      '--dev-client-url',
      `http://localhost:${metroPort}`,
      '--device',
      device,
      '--flows',
      flow,
      '--output',
      path.join(out, department.scenario),
      '--',
      '-e',
      `QA_USERNAME=${admin.username}`,
      '-e',
      `QA_PASSWORD=${manifest.credentials.password}`,
      '-e',
      `QA_TOTP=${admin.totpSecret ? freshTotp(admin.username, admin.totpSecret) : 'none'}`,
      '-e',
      `QA_SETTLE_MS=${settleMs}`,
    ]);

    if (status !== 0) failures++;
  }

  const bundleFailures = bundleFailuresSince(logStart);

  for (const failure of bundleFailures) console.log(`  the app's bundle failed to build: ${failure}`);

  if (bundleFailures.length) failures++;

  const errors = appErrorsSince(logStart);
  const unexplained = errors.filter((block) => !EXPLAINED_APP_ERRORS.some((known) => known.pattern.test(block)));

  if (errors.length) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'app-errors.txt'), `${errors.join('\n\n----\n\n')}\n`);
    console.log(`  ${errors.length} console errors from the app (${unexplained.length} unexplained): ${path.relative(repoRoot, path.join(out, 'app-errors.txt'))}`);
  }

  if (unexplained.length && !values['allow-app-errors']) failures++;

  return failures;
}

function startMetro(): ChildProcess {
  log(`Metro for ${variant} on :${metroPort} (API ${NATIVE_API_URL})`);
  const logFile = fs.openSync(path.join(runDir, 'metro.log'), 'w');

  // The client settings (extra.env) come from Metro at runtime: the development builds talk to the QA stack's http door.
  const metro = spawn(process.execPath, [require.resolve('expo/bin/cli', { paths: [omniRoot] }), 'start', '--dev-client', '--port', String(metroPort)], {
    cwd: omniRoot,
    env: { ...NATIVE_ENV, APP_VARIANT: variant, APP_ENV: 'development', EXPO_NO_DOTENV: '1', BASE_API_URL: NATIVE_API_URL, CI: '1' },
    stdio: ['ignore', logFile, logFile],
  });

  // Metro has its own copy of the descriptor; the log is read back by path.
  fs.closeSync(logFile);
  started.push(metro);

  return metro;
}

const ExpoManifestSchema = z.object({ launchAsset: z.object({ url: z.string() }) });

/**
 * Builds a platform's bundle while its native build runs, from the URL in Metro's own manifest (the one the dev client
 * asks for): a dev client waits a limited time for its first bundle, and one built from cold caches takes longer.
 */
async function warmBundle(platform: 'ios' | 'android'): Promise<void> {
  const started = Date.now();

  try {
    const manifest = ExpoManifestSchema.parse(await (await fetch(`http://localhost:${metroPort}/`, { headers: { 'expo-platform': platform, accept: 'application/expo+json,application/json' } })).json());
    const bundle = await fetch(manifest.launchAsset.url);

    await bundle.arrayBuffer();
    console.log(`  ${platform} bundle built in ${Math.round((Date.now() - started) / 1000)}s (HTTP ${bundle.status})`);
  } catch (error) {
    console.log(`  could not build the ${platform} bundle ahead: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** True when something already listens on the port. */
function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(true));
    server.once('listening', () => server.close(() => resolve(false)));
    server.listen(port);
  });
}

async function metroReady(): Promise<boolean> {
  try {
    return (await (await fetch(`http://localhost:${metroPort}/status`)).text()).includes('packager-status:running');
  } catch {
    return false;
  }
}

/** Builds the development client for one device (scripts/run-native.mjs prebuilds when the native project is another app's). */
function buildNative(platform: 'ios' | 'android', device: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve) => {
    let text = '';
    const child = spawn('node', ['scripts/run-native.mjs', platform, variant, '--no-bundler', '--device', device], { cwd: repoRoot, env: { ...NATIVE_ENV, APP_ENV: 'development' } });

    const tee = (chunk: Buffer, to: NodeJS.WriteStream): void => {
      text += chunk.toString();
      to.write(chunk);
    };

    child.stdout.on('data', (chunk: Buffer) => tee(chunk, process.stdout));
    child.stderr.on('data', (chunk: Buffer) => tee(chunk, process.stderr));
    child.on('close', (code) => resolve({ status: code ?? 1, text }));
  });
}

const ANDROID_APK = path.join(omniRoot, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

/** Installs the debug APK Gradle just built: a long streamed install over a loaded emulator's adb link can drop, so retry. */
async function installApk(serial: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await emulatorOnline(serial);

    if (run(adb, ['-s', serial, 'install', '-r', ANDROID_APK]) === 0) return true;
  }

  return false;
}

// ---- iOS simulators ------------------------------------------------------------------------------------------------------

interface Simulator {
  name: string;
  udid: string;
  booted: boolean;
}

const SimctlList = z.object({ devices: z.record(z.string(), z.array(z.object({ name: z.string(), udid: z.string(), state: z.string(), isAvailable: z.boolean().optional() }))) });

function simulator(kind: FormFactor, wanted: string | undefined): Simulator {
  const parsed = SimctlList.safeParse(JSON.parse(output('xcrun', ['simctl', 'list', 'devices', 'available', '-j']) || '{}'));

  if (!parsed.success) fail('could not read the simulator list (xcrun simctl list devices -j)');

  const runtimes = Object.keys(parsed.data.devices)
    .filter((runtime) => /iOS/.test(runtime))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  const prefix = kind === 'phone' ? /^iPhone/ : /^iPad/;

  for (const runtime of runtimes) {
    const devices = parsed.data.devices[runtime] ?? [];

    const device = wanted
      ? devices.find((d) => d.name === wanted || d.udid === wanted)
      : (devices.find((d) => prefix.test(d.name) && /Pro/.test(d.name) && !/Max|13-inch/.test(d.name)) ?? devices.find((d) => prefix.test(d.name)));

    if (device) return { name: device.name, udid: device.udid, booted: device.state === 'Booted' };
  }

  return fail(`no ${wanted ?? (kind === 'phone' ? 'iPhone' : 'iPad')} simulator is available (pass --ios-${kind} <name>)`);
}

async function bootSimulator(kind: FormFactor, wanted: string | undefined): Promise<string> {
  const device = simulator(kind, wanted);

  if (!device.booted) {
    run('xcrun', ['simctl', 'boot', device.udid]);

    if (!values['keep-devices']) bootedDevices.push(() => run('xcrun', ['simctl', 'shutdown', device.udid], { stdio: 'ignore' }));
  }

  run('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], { stdio: 'ignore' });
  console.log(`  ${kind}: ${device.name} (${device.udid})`);

  return device.udid;
}

// ---- Android emulators ---------------------------------------------------------------------------------------------------

const avds = (): string[] => output(emulatorBin, ['-list-avds']).split('\n').filter(Boolean);

function avdIni(name: string): string {
  const file = path.join(os.homedir(), '.android', 'avd', `${name}.avd`, 'config.ini');

  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

const isTabletAvd = (name: string): boolean => /tablet|pad|tab/i.test(`${name}\n${avdIni(name).match(/hw\.device\.name=(.*)/)?.[1] ?? ''}`);

function phoneAvd(): string {
  const wanted = values['android-phone'];
  const found = wanted ? avds().find((name) => name === wanted) : avds().find((name) => !isTabletAvd(name));

  return found ?? fail(`no phone AVD found${wanted ? ` named ${wanted}` : ''}; create one in Android Studio or pass --android-phone <avd>`);
}

/** The tablet AVD, created from the phone AVD's system image (Pixel Tablet hardware profile) when it does not exist. */
function tabletAvd(phone: string): string {
  const wanted = values['android-tablet'];

  if (avds().includes(wanted)) return wanted;

  const sysdir = avdIni(phone)
    .match(/image\.sysdir\.1=(.*)/)?.[1]
    ?.trim();

  if (!sysdir) fail(`cannot read the system image of ${phone}; create a tablet AVD named ${wanted} or pass --android-tablet <avd>`);

  const image = sysdir
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .join(';');

  console.log(`  creating ${wanted} (pixel_tablet, ${image})`);
  // avdmanager asks whether to create a custom hardware profile.
  const status = run(avdmanager, ['create', 'avd', '--name', wanted, '--package', image, '--device', 'pixel_tablet'], { input: 'no\n', stdio: ['pipe', 'inherit', 'inherit'] });

  if (status !== 0) fail(`could not create the tablet AVD ${wanted}`);

  return wanted;
}

function runningEmulator(avd: string): string | null {
  for (const serial of output(adb, ['devices'])
    .split('\n')
    .map((line) => line.split('\t')[0] ?? '')
    .filter((s) => s.startsWith('emulator-'))) {
    if (output(adb, ['-s', serial, 'emu', 'avd', 'name']).split('\n')[0]?.trim() === avd) return serial;
  }

  return null;
}

/** An emulator's ADB link can drop to `offline` under load (a long build in between): reconnect and wait for `device`. */
async function emulatorOnline(serial: string): Promise<void> {
  await waitFor(
    `${serial} to be online in adb`,
    () => {
      const state = output(adb, ['-s', serial, 'get-state']);

      if (state !== 'device') run(adb, ['reconnect', 'offline'], { stdio: 'ignore' });

      return state === 'device';
    },
    180_000
  );

  // The emulator's localhost is the emulator: Metro and the QA stack's http doors come through adb reverse, which a
  // reconnect drops, so the mappings go in again every time.
  for (const port of [metroPort, ...NATIVE_PORTS]) run(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'ignore' });
}

async function bootEmulator(kind: FormFactor, avd: string, port: number): Promise<string> {
  let serial = runningEmulator(avd);

  if (!serial) {
    serial = `emulator-${port}`;
    const child = spawn(emulatorBin, ['-avd', avd, '-port', String(port), '-no-snapshot-save', '-no-boot-anim', '-no-audio'], { stdio: 'ignore', detached: true });
    const booted = serial;

    child.unref();

    if (!values['keep-devices']) bootedDevices.push(() => run(adb, ['-s', booted, 'emu', 'kill'], { stdio: 'ignore' }));
  }

  const target = serial;

  await waitFor(`${avd} to boot`, () => output(adb, ['-s', target, 'shell', 'getprop', 'sys.boot_completed']) === '1', 300_000);
  await emulatorOnline(target);

  // The apps hide the navigation bar (FocusAwareStatusBar); a fresh device answers that with a "Viewing full screen"
  // notice over the app until someone taps Got it.
  run(adb, ['-s', target, 'shell', 'settings', 'put', 'secure', 'immersive_mode_confirmations', 'confirmed'], { stdio: 'ignore' });
  // A loaded host makes the emulator's own system process miss deadlines, and its "isn't responding" dialog then covers
  // whatever the flow is looking for. Hidden as test harnesses do; an app that crashes still fails the flow (it is gone).
  run(adb, ['-s', target, 'shell', 'settings', 'put', 'global', 'hide_error_dialogs', '1'], { stdio: 'ignore' });

  // Phones portrait, tablets landscape, set here rather than in the flow (support/qa-native-flows.ts): rotation 0 is
  // the screen's natural shape, which is landscape on a Pixel Tablet and portrait on a phone.
  const [width = 0, height = 0] = (/(\d+)x(\d+)/.exec(output(adb, ['-s', target, 'shell', 'wm', 'size'])) ?? []).slice(1).map(Number);

  run(adb, ['-s', target, 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0'], { stdio: 'ignore' });
  run(adb, ['-s', target, 'shell', 'settings', 'put', 'system', 'user_rotation', width > height === (kind === 'tablet') ? '0' : '1'], { stdio: 'ignore' });

  console.log(`  ${kind}: ${avd} (${target})`);

  return target;
}

// ---- Run -------------------------------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  // A Metro left on the port (an interrupted run) would answer the readiness check and serve the apps a bundle of the
  // tree as it was then, so the native legs would test stale code without a sign of it.
  if ((wants('ios') || wants('android')) && (await portInUse(metroPort))) fail(`port ${metroPort} is in use (a Metro left running?): stop it or pass --metro-port`);

  fs.mkdirSync(runDir, { recursive: true });
  const manifest = stack();

  if (wants('web') || wants('electron')) {
    if (webExport() !== 0) fail('the web export failed');
  }

  if (wants('web')) await leg(`web (${variant})`, path.join(runDir, 'web'), async () => playwright(`qa-${variant}`, path.join(runDir, 'web'), values.workers));

  if (wants('electron')) await leg(`electron (${variant})`, path.join(runDir, 'electron'), async () => playwright(`qa-desktop-${variant}`, path.join(runDir, 'electron'), '1'));

  if (wants('ios') || wants('android')) {
    // One device at a time (boot, install, test, shut down): two emulators beside the simulators, Metro and the stack
    // overload a typical machine, and their adb links start to drop. Metro bundles while the first build runs.
    startMetro();
    const metroUp = waitFor('Metro', metroReady, 300_000);
    // One platform at a time, in the order the devices run.
    const iosBundle = wants('ios') ? metroUp.then(async () => warmBundle('ios')) : metroUp;
    const bundled = { ios: iosBundle, android: wants('android') ? iosBundle.then(async () => warmBundle('android')) : iosBundle };

    const runOn = async (platform: 'ios' | 'android', formFactor: FormFactor, device: string): Promise<void> => {
      await bundled[platform];

      if (platform === 'android') await emulatorOnline(device);
      await leg(`${platform} ${formFactor} (${variant})`, path.join(runDir, `${platform}-${formFactor}`), async () => maestroLeg(platform, formFactor, device, manifest));
    };

    const shutDownBooted = (): void => {
      for (const shutdown of bootedDevices.splice(0)) shutdown();
    };

    if (wants('ios')) {
      for (const formFactor of (['phone', 'tablet'] as const).filter(wantsFormFactor)) {
        log(`iOS ${formFactor}`);
        const device = await bootSimulator(formFactor, values[formFactor === 'phone' ? 'ios-phone' : 'ios-tablet']);

        log(`Build ${variant} for iOS (${formFactor})`);

        if ((await buildNative('ios', device)).status !== 0) legs.push({ name: `ios ${formFactor}`, status: 'failed', seconds: 0, report: '', detail: 'build failed' });
        else await runOn('ios', formFactor, device);
        shutDownBooted();
      }
    }

    if (wants('android')) {
      const phoneName = phoneAvd();
      let built = false;

      // A server already running may have mDNS on: restart it under this run's environment (ADB_MDNS above).
      run(adb, ['kill-server'], { stdio: 'ignore' });
      run(adb, ['start-server'], { stdio: 'ignore' });

      for (const formFactor of (['phone', 'tablet'] as const).filter(wantsFormFactor)) {
        log(`Android ${formFactor}`);
        const device = formFactor === 'phone' ? await bootEmulator('phone', phoneName, 5554) : await bootEmulator('tablet', tabletAvd(phoneName), 5556);
        let installed: boolean;

        if (!built) {
          // Gradle once, for the first emulator; when only expo run's own install failed, the built APK goes in with adb.
          log(`Build ${variant} for Android (${formFactor})`);
          const build = await buildNative('android', device);

          built = build.status === 0 || /BUILD SUCCESSFUL/.test(build.text);
          installed = build.status === 0 || (built && (await installApk(device)));
        } else {
          log(`Install ${variant} on Android (${formFactor})`);
          installed = await installApk(device);
        }

        if (!installed) legs.push({ name: `android ${formFactor}`, status: 'failed', seconds: 0, report: '', detail: 'build or install failed' });
        else await runOn('android', formFactor, device);
        shutDownBooted();
      }
    }
  }

  const metroErrors = fs.existsSync(path.join(runDir, 'metro.log'))
    ? fs
        .readFileSync(path.join(runDir, 'metro.log'), 'utf8')
        .split('\n')
        .filter((line) => /\bERROR\b/.test(line))
    : [];

  fs.writeFileSync(path.join(runDir, 'summary.json'), `${JSON.stringify({ variant, platforms, scenarios: values.scenarios ?? 'all', legs, metroErrors: metroErrors.length }, null, 2)}\n`);
  log(`Summary (${path.relative(repoRoot, runDir)})`);

  for (const l of legs)
    console.log(`  ${l.status === 'passed' ? 'pass' : l.status === 'skipped' ? 'skip' : 'FAIL'}  ${l.name.padEnd(28)} ${String(l.seconds).padStart(5)}s  ${l.report}${l.detail ? `  (${l.detail})` : ''}`);

  // console.error from the native apps reaches Metro's log: listed, not judged (the flows judge what the screen shows).
  if (metroErrors.length) console.log(`  ${metroErrors.length} ERROR lines from the native apps in ${path.relative(repoRoot, path.join(runDir, 'metro.log'))}`);
  process.exitCode = legs.some((l) => l.status === 'failed') ? 1 : 0;
}

/** Stops what this run started; safe to call again (fail() and main's finally can both reach it). */
function cleanUp(): void {
  for (const child of started.splice(0)) child.kill();

  for (const shutdown of bootedDevices.splice(0)) shutdown();
}

for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const) {
  process.on(signal, () => {
    cleanUp();
    process.exit(code);
  });
}

// An error escapes as an unhandled rejection: Node prints it and exits 1, after the devices and Metro are stopped.
void main().finally(cleanUp);
