// What `import { X } from 'react-native'` gets in the iOS and Android bundles. NativeWind's Metro config
// (globalClassNamePolyfill) resolves 'react-native' in every module outside react-native and react-native-css to
// react-native-css/components, which re-exports react-native through a fixed list of getters. A name missing from that
// list is undefined at runtime, with no build error: AssetRegistry was, so expo-asset's Asset.fromModule threw "Cannot
// read property 'getAssetByID' of undefined" in debug and release builds and the iOS PTT and voice-room sounds never
// loaded (patches/react-native-css@3.1.0-rc.0.patch). Web is not affected: there 'react-native' is react-native-web.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { withNativewind } from 'nativewind/metro';
import { z } from 'zod';

// withNativewind also takes an async config factory; the tests pass the config itself.
type MetroConfig = Exclude<Parameters<typeof withNativewind>[0], () => Promise<object>>;

type CustomResolver = NonNullable<NonNullable<MetroConfig['resolver']>['resolveRequest']>;

type ResolutionContext = Parameters<CustomResolver>[0];

const SUBSTITUTE = 'react-native-css/components';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const appRequire = createRequire(path.join(__dirname, '..', 'package.json'));

// expo-asset imports AssetRegistry from 'react-native' here: the module the PTT sounds failed in.
const libraryModule = path.join(path.dirname(appRequire.resolve('expo-asset/package.json')), 'build', 'Asset.js');

/** The names a `module.exports = { get Name() {…} }` file exports, plus any added by Object.defineProperty(module.exports). */
function exportedNames(file: string): Set<string> {
  const source = fs.readFileSync(file, 'utf8');
  const names = new Set<string>();

  for (const [, name] of source.matchAll(/^ {2}get (\w+)\(\)/gm)) {
    if (name) names.add(name);
  }

  for (const [, name] of source.matchAll(/Object\.defineProperty\(module\.exports,\s*['"](\w+)['"]/g)) {
    if (name) names.add(name);
  }

  return names;
}

/** Resolves `react-native` for a library module the way the app's Metro config does on a native platform. */
function resolveReactNative(platform: 'ios' | 'android') {
  const requested: string[] = [];

  // Node resolution with CommonJS conditions stands in for Metro's own resolver underneath NativeWind's.
  const metroDefault: CustomResolver = (context, moduleName) => {
    requested.push(moduleName);

    return { type: 'sourceFile', filePath: createRequire(context.originModulePath).resolve(moduleName) };
  };

  const input: MetroConfig = { resolver: {} };
  const resolveRequest = withNativewind(input, { disableTypeScriptGeneration: true }).resolver?.resolveRequest;

  if (!resolveRequest) throw new Error('withNativewind no longer installs resolver.resolveRequest');
  // SAFETY: react-native-css's resolver reads only originModulePath and resolveRequest from the context.
  const context = { originModulePath: libraryModule, resolveRequest: metroDefault } as ResolutionContext;
  const resolution = resolveRequest(context, 'react-native', platform);

  if (resolution.type !== 'sourceFile') throw new Error(`react-native resolved to ${resolution.type}`);

  return { filePath: resolution.filePath, requested };
}

const conditionTarget = z.object({ default: z.string() });
const manifestSchema = z.object({ exports: z.object({ './components': z.object({ import: conditionTarget, require: conditionTarget }) }) });

/** Both files Metro can pick for react-native-css/components: `import` for ES module importers, `require` for CommonJS. */
function substituteFiles(): string[] {
  const manifestPath = appRequire.resolve('react-native-css/package.json');
  const entry = manifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))).exports['./components'];

  return [entry.import.default, entry.require.default].map((target) => path.join(path.dirname(manifestPath), target));
}

describe("'react-native' as native library code sees it", () => {
  const reactNativeNames = exportedNames(appRequire.resolve('react-native'));

  it('reads the public API from react-native’s index', () => {
    // Guards the parser: an empty or partial list would let the export check below pass without checking anything.
    expect(reactNativeNames.size).toBeGreaterThan(80);
    expect([...reactNativeNames]).toEqual(expect.arrayContaining(['AssetRegistry', 'NativeModules', 'Platform', 'Touchable', 'View']));
  });

  it.each(['ios', 'android'] as const)('is NativeWind’s re-export module on %s', (platform) => {
    const { filePath, requested } = resolveReactNative(platform);
    expect(requested).toEqual(['react-native', SUBSTITUTE]);
    expect(substituteFiles()).toContain(filePath);
  });

  it.each(substituteFiles().map((file) => [path.relative(repoRoot, file), file]))('%s exposes every react-native export', (_label, file) => {
    const substituteNames = exportedNames(file);
    expect([...reactNativeNames].filter((name) => !substituteNames.has(name))).toEqual([]);
  });
});
