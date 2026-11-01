// Fingerprint (runtime version) inputs for expo-updates (omni-plan D18, §6.6.2).
// Version/build numbers and the `extra` section (client env, release metadata) change on every release run
// without changing native code; including them would make every release a native build and OTA impossible.
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ['ExpoConfigVersions', 'ExpoConfigExtraSection'],
};
