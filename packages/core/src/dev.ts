/** True in development builds. Safe outside React Native (Node tooling and tests), where `__DEV__` is undefined. */
export const isDev = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__;

/** True inside a Jest worker. */
export const isJest = (): boolean => typeof process !== 'undefined' && typeof process.env?.JEST_WORKER_ID !== 'undefined';
