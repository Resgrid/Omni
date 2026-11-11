// Fingerprint (runtime version) inputs for expo-updates (omni-plan D18, §6.6.2).
// Version/build numbers and the `extra` section (client env, release metadata) change on every release run
// without changing native code; including them would give every release a new runtime, so no hotfix update
// (ota.yml) could reach the binaries already installed.
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['ExpoConfigVersions', 'ExpoConfigExtraSection'],
};
