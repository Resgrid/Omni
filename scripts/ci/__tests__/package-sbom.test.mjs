// node --test scripts/ci/__tests__ — scripts/ci/package-sbom.mjs (the SBOM release.yml attaches to each store package).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { cocoaPods, cycloneDx, findDirectory, gradleArtifacts, pnpmProductionPackages, writeSigningStub } from '../package-sbom.mjs';

const require = createRequire(import.meta.url);
const yaml = require('yaml');

const integrity = 'sha512-' + Buffer.from('a'.repeat(64)).toString('base64');

describe('pnpmProductionPackages', () => {
  const lock = {
    lockfileVersion: '9.0',
    importers: {
      'apps/omni': {
        dependencies: {
          '@resgrid/ui': { specifier: 'workspace:*', version: 'link:../../packages/ui' },
          expo: { specifier: 'catalog:', version: '58.0.22(react@19.3.0)' },
          react: { specifier: 'catalog:', version: '19.3.0' },
        },
        optionalDependencies: { fsevents: { specifier: '2.3.3', version: '2.3.3' } },
        devDependencies: { jest: { specifier: 'catalog:', version: '30.5.2' } },
      },
      'packages/ui': {
        dependencies: { 'lucide-react-native': { specifier: 'catalog:', version: '1.0.0(react@19.3.0)' }, '@resgrid/core': { specifier: 'workspace:*', version: 'link:../core' } },
        devDependencies: { typescript: { specifier: 'catalog:', version: '6.0.3' } },
      },
      'packages/core': { dependencies: { axios: { specifier: 'catalog:', version: '1.21.0' } } },
      'apps/desktop': { dependencies: { electron: { specifier: 'catalog:', version: '45.0.0' } } },
    },
    packages: {
      'expo@58.0.22': { resolution: { integrity }, peerDependencies: { react: '*', '@testing-library/react-native': '*' } },
      'react@19.3.0': { resolution: { integrity } },
      'fsevents@2.3.3': { resolution: { integrity } },
      'lucide-react-native@1.0.0': { resolution: { integrity }, peerDependencies: { react: '*' } },
      'axios@1.21.0': { resolution: { integrity } },
      'string-width@4.2.3': { resolution: { integrity } },
      '@expo/cli@58.1.18': { resolution: { integrity } },
      '@testing-library/react-native@14.1.0': { resolution: { integrity } },
    },
    snapshots: {
      'expo@58.0.22(react@19.3.0)': {
        dependencies: { '@expo/cli': '58.1.18', react: '19.3.0', 'string-width-cjs': 'string-width@4.2.3' },
        optionalDependencies: { '@testing-library/react-native': '14.1.0' },
      },
      'react@19.3.0': {},
      'fsevents@2.3.3': {},
      'lucide-react-native@1.0.0(react@19.3.0)': { dependencies: { react: '19.3.0' } },
      'axios@1.21.0': {},
      'string-width@4.2.3': {},
      '@expo/cli@58.1.18': {},
      '@testing-library/react-native@14.1.0': {},
    },
  };

  it('lists the importer’s runtime packages, through linked workspace packages, and not its dev or peer ones', () => {
    const found = pnpmProductionPackages(lock, 'apps/omni').map((p) => `${p.name}@${p.version}`);
    assert.deepEqual(found, ['@expo/cli@58.1.18', 'axios@1.21.0', 'expo@58.0.22', 'fsevents@2.3.3', 'lucide-react-native@1.0.0', 'react@19.3.0', 'string-width@4.2.3']);
  });

  it('keeps each package’s integrity hash', () => {
    assert.equal(pnpmProductionPackages(lock, 'apps/omni').find((p) => p.name === 'axios').integrity, integrity);
  });

  it('refuses another lockfile version or a missing importer', () => {
    assert.throws(() => pnpmProductionPackages({ ...lock, lockfileVersion: '6.0' }, 'apps/omni'), /not supported/);
    assert.throws(() => pnpmProductionPackages(lock, 'apps/none'), /no importer/);
  });
});

describe('gradleArtifacts', () => {
  const output = [
    '',
    '------------------------------------------------------------',
    "Project ':app'",
    '------------------------------------------------------------',
    '',
    'releaseRuntimeClasspath - Resolved configuration for runtime for variant: release',
    '+--- com.facebook.react:react-android -> 0.88.1',
    '|    +--- androidx.appcompat:appcompat:1.7.0',
    '|    |    +--- androidx.annotation:annotation:1.3.0 -> 1.9.1',
    '|    |    \\--- androidx.core:core:{strictly 1.13.1} -> 1.13.1 (c)',
    '|    \\--- org.jetbrains.kotlin:kotlin-stdlib:2.1.20 (*)',
    '+--- project :expo',
    '|    \\--- project :expo-modules-core',
    '|         \\--- androidx.annotation:annotation:1.9.1 (*)',
    '+--- com.example:replaced:1.0 -> project :local',
    '+--- com.google.firebase:firebase-messaging:{strictly 24.1.0}',
    '+--- com.example:missing:1.0 FAILED',
    '\\--- com.example:not-resolved:2.0 (n)',
    '',
    '(c) - A dependency constraint, not a dependency. The dependency affected by the constraint occurs elsewhere in the tree.',
    '(*) - Indicates repeated occurrences of a transitive dependency subtree.',
  ].join('\n');

  it('lists each artifact once, at the version Gradle resolved', () => {
    assert.deepEqual(
      gradleArtifacts(output).map((a) => `${a.group}:${a.name}@${a.version}`),
      [
        'androidx.annotation:annotation@1.9.1',
        'androidx.appcompat:appcompat@1.7.0',
        'com.facebook.react:react-android@0.88.1',
        'com.google.firebase:firebase-messaging@24.1.0',
        'org.jetbrains.kotlin:kotlin-stdlib@2.1.20',
      ]
    );
  });
});

describe('cocoaPods', () => {
  const podfileLock = yaml.parse(
    [
      'PODS:',
      '  - boost (1.84.0)',
      '  - EXConstants (17.0.3):',
      '    - ExpoModulesCore',
      '  - FirebaseCore (11.4.0):',
      '    - FirebaseCoreInternal (~> 11.0)',
      '  - FirebaseCoreInternal (11.4.0)',
      '  - "GoogleUtilities/Environment (8.0.2)"',
      '  - "GoogleUtilities/Logger (8.0.2)"',
      'EXTERNAL SOURCES:',
      '  boost:',
      '    :podspec: "../../../node_modules/react-native/third-party-podspecs/boost.podspec"',
      '  EXConstants:',
      '    :path: "../../../node_modules/expo-constants/ios"',
      'COCOAPODS: 1.16.2',
    ].join('\n')
  );

  it('lists each pod once, leaving out the ones npm packages build from node_modules', () => {
    assert.deepEqual(
      cocoaPods(podfileLock).map((p) => `${p.name}@${p.version}`),
      ['boost@1.84.0', 'FirebaseCore@11.4.0', 'FirebaseCoreInternal@11.4.0', 'GoogleUtilities@8.0.2']
    );
  });
});

describe('cycloneDx', () => {
  it('describes the package file by its SHA-256 and lists components with package URLs', () => {
    const bom = cycloneDx({
      packageName: 'ResgridUnit-8.12-android.aab',
      packageSha256: 'f'.repeat(64),
      version: '8.12',
      npm: [
        { name: '@expo/cli', version: '58.1.18', integrity },
        { name: 'react', version: '19.3.0' },
      ],
      maven: [{ group: 'androidx.core', name: 'core', version: '1.13.1' }],
      pods: [{ name: 'FirebaseCore', version: '11.4.0' }],
      timestamp: '2026-11-02T00:00:00.000Z',
    });
    assert.equal(bom.bomFormat, 'CycloneDX');
    assert.equal(bom.specVersion, '1.6');
    assert.match(bom.serialNumber, /^urn:uuid:[0-9a-f-]{36}$/);
    assert.deepEqual(bom.metadata.component, {
      type: 'application',
      'bom-ref': 'ResgridUnit-8.12-android.aab',
      name: 'ResgridUnit-8.12-android.aab',
      version: '8.12',
      hashes: [{ alg: 'SHA-256', content: 'f'.repeat(64) }],
    });
    assert.deepEqual(
      bom.components.map((c) => c.purl),
      ['pkg:npm/%40expo/cli@58.1.18', 'pkg:npm/react@19.3.0', 'pkg:maven/androidx.core/core@1.13.1', 'pkg:cocoapods/FirebaseCore@11.4.0']
    );
    assert.deepEqual(bom.components[0], {
      type: 'library',
      'bom-ref': 'pkg:npm/%40expo/cli@58.1.18',
      group: '@expo',
      name: 'cli',
      version: '58.1.18',
      purl: 'pkg:npm/%40expo/cli@58.1.18',
      hashes: [{ alg: 'SHA-512', content: Buffer.from('a'.repeat(64)).toString('hex') }],
    });
    assert.equal(bom.components[1].hashes, undefined);
  });
});

describe('findDirectory', () => {
  it('finds the native project in EAS’s kept copy of the repository, not one inside node_modules', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'package-sbom-'));
    try {
      const make = (rel) => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), '');
      };
      make('build/node_modules/some-lib/android/settings.gradle');
      make('build/node_modules/some-lib/android/gradlew');
      fs.mkdirSync(path.join(root, 'build/node_modules/some-lib/android/app'), { recursive: true });
      make('build/apps/omni/android/settings.gradle');
      make('build/apps/omni/android/gradlew');
      fs.mkdirSync(path.join(root, 'build/apps/omni/android/app'), { recursive: true });
      make('build/apps/omni/ios/Podfile');
      make('build/apps/omni/ios/Podfile.lock');
      assert.equal(findDirectory(root, [['settings.gradle', 'settings.gradle.kts'], 'gradlew', 'app']), path.join(root, 'build/apps/omni/android'));
      assert.equal(findDirectory(root, ['Podfile', 'Podfile.lock']), path.join(root, 'build/apps/omni/ios'));
      assert.equal(findDirectory(root, ['missing.file']), null);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('writeSigningStub', () => {
  it('gives eas-build-inject-android-credentials.gradle a credentials.json without the real keystore', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'package-sbom-'));

    try {
      const env = writeSigningStub(dir);

      assert.deepEqual(env, { EAS_BUILD_WORKINGDIR: dir });

      // The fields the Gradle script reads: keystorePath, keystorePassword, keyAlias and, when present, keyPassword.
      const { keystore } = JSON.parse(fs.readFileSync(path.join(env.EAS_BUILD_WORKINGDIR, 'credentials.json'), 'utf8')).android;

      assert.equal(path.dirname(keystore.keystorePath), dir);
      assert.equal(fs.existsSync(keystore.keystorePath), false);
      assert.equal(keystore.keystorePassword, 'unused');
      assert.equal(keystore.keyAlias, 'unused');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
