// expo-constants fake: the embedded Expo config is settable per test.
const Constants: { expoConfig: unknown } = { expoConfig: { extra: {} } };

export default Constants;

export function __setExpoConfig(config: unknown): void {
  Constants.expoConfig = config;
}
