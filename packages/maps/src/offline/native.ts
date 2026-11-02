// @resgrid/maps/offline/native — platform adapters for the offline pack manager (expo-file-system storage and background
// transfers, NetInfo Wi-Fi probe, MapLibre ambient cache). Kept out of the package index so tests and web bundles that import
// `@resgrid/maps` never load these native modules. The app shell imports them once when it builds the manager.
export { setMaplibreAmbientCacheSize } from './ambient-cache';
export { BACKGROUND_TRANSFER_RESUME_KEY, createExpoBackgroundTransfer, type ExpoBackgroundTransferOptions } from './expo-background-transfer';
export { createExpoPackFileStore, OFFLINE_PACKS_DIRECTORY } from './expo-file-store';
export { createNetInfoNetworkProbe, type OfflineNetworkProbe, type OfflineNetworkState, toOfflineNetworkState } from './network';
