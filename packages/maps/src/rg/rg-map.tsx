/**
 * Type-resolution shim: Metro picks `rg-map.native.tsx` on iOS/Android and `rg-map.web.tsx` on web and Electron;
 * TypeScript resolves this file, which re-exports the native implementation (both expose the same API from ./types).
 */
export * from './rg-map.native';
