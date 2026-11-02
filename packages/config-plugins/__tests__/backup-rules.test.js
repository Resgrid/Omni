// Offline map packs stay out of Android backups and device transfers (MapLibre plan §19.5, §19.11; D17). Nothing new is
// needed for that today, and this guards why: every variant's main application sets android:allowBackup="false"
// (custom-manifest.js: no cloud backup, and no backup or transfer at all up to Android 11), and expo-secure-store's
// data-extraction rules (Android 12+, where allowBackup=false still allows device-to-device transfer) include only shared
// preferences — the `file` domain, where expo-file-system's documents directory and so `resgrid-offline-maps/` live, is
// never transferred. A change to either (secure-store's `configureAndroidBackup: false`, a new backup rule set, allowBackup)
// fails here: then add explicit `<exclude domain="file" path="resgrid-offline-maps/"/>` rules in a plugin of our own.
const fs = require('fs');
const path = require('path');

const mockManifestActions = [];
const mockPlugins = () => ({
  withAndroidManifest: (config, action) => {
    mockManifestActions.push(action);
    return config;
  },
  AndroidConfig: { Manifest: { getMainApplicationOrThrow: (manifest) => manifest.manifest.application[0] } },
  IOSConfig: { Permissions: { createPermissionsPlugin: () => (config) => config } },
  createRunOncePlugin: (plugin) => plugin,
});
jest.mock('@expo/config-plugins', () => mockPlugins());
jest.mock('expo/config-plugins', () => mockPlugins());

const { createAppConfig } = require('../src/app-config');
const { VARIANT_IDS } = require('../src/variants');

const omniRoot = path.resolve(__dirname, '..', '..', '..', 'apps', 'omni');
const secureStoreRoot = path.dirname(require.resolve('expo-secure-store/package.json'));

const build = (variant) => createAppConfig({ variant, appEnv: 'production', runNumber: 7, projectRoot: omniRoot, env: {} });
const pluginEntry = (config, name) => config.plugins.find((entry) => path.basename(String(Array.isArray(entry) ? entry[0] : entry)) === name);

/** Applies the manifest mods the plugins registered to an empty manifest, in plugin order. */
async function manifestAfter(plugins) {
  mockManifestActions.length = 0;
  for (const [plugin, options] of plugins) plugin({}, options);
  let config = { modResults: { manifest: { $: {}, application: [{ $: {} }] } } };
  for (const action of mockManifestActions) config = await action(config);
  return config.modResults.manifest.application[0].$;
}

/** Domains a rules section includes (`<include domain="…">`). */
const includedDomains = (xml, section) => {
  const body = new RegExp(`<${section}>([\\s\\S]*?)</${section}>`).exec(xml)?.[1] ?? '';
  return [...body.matchAll(/<include\s+domain="([^"]+)"/g)].map((match) => match[1]);
};

describe('Android backup rules keep offline map packs on the device', () => {
  it.each(VARIANT_IDS)('%s: no backup, and secure-store’s data-extraction rules apply', async (variant) => {
    const config = build(variant);
    const secureStore = pluginEntry(config, 'expo-secure-store');
    expect(secureStore).toBeDefined();
    expect(Array.isArray(secureStore) ? secureStore[1].configureAndroidBackup : undefined).not.toBe(false);
    const customManifest = pluginEntry(config, 'custom-manifest.js');
    expect(customManifest).toBeDefined();

    const withSecureStore = require('expo-secure-store/plugin/build/withSecureStore.js').default;
    const withCustomManifest = require('../plugins/custom-manifest');
    const application = await manifestAfter([
      [withSecureStore, Array.isArray(secureStore) ? secureStore[1] : {}],
      [withCustomManifest, customManifest[1]],
    ]);
    expect(application['android:allowBackup']).toBe('false');
    expect(application['android:dataExtractionRules']).toBe('@xml/secure_store_data_extraction_rules');
    expect(application['android:fullBackupContent']).toBe('@xml/secure_store_backup_rules');
  });

  it('transfers and backs up shared preferences only (never the file domain with resgrid-offline-maps/)', () => {
    const extraction = fs.readFileSync(path.join(secureStoreRoot, 'android', 'src', 'main', 'res', 'xml', 'secure_store_data_extraction_rules.xml'), 'utf8');
    expect(includedDomains(extraction, 'device-transfer')).toEqual(['sharedpref']);
    expect(includedDomains(extraction, 'cloud-backup')).toEqual(['sharedpref']);
    const legacy = fs.readFileSync(path.join(secureStoreRoot, 'android', 'src', 'main', 'res', 'xml', 'secure_store_backup_rules.xml'), 'utf8');
    expect(includedDomains(legacy, 'full-backup-content')).toEqual(['sharedpref']);
  });
});
