import type { StyleSpecification } from '../types';
import type { OfflineInstalledSet } from './manager';
import { offlineStyleComposer } from './style-composer';
import { type MapOfflineOptions, OFFLINE_MAP_ATTRIBUTION, type OfflineMapMode, type OfflineStyleComposer } from './types';

/**
 * The online/offline style switch (MapLibre plan D16) as a pure function:
 * - no base pack installed → `online` (the department style; the ambient cache still helps);
 * - packs installed and the device offline → `offline` (composite local style);
 * - packs installed, online, and the department (or the app) prefers local → `local-preferred`;
 * - otherwise `online`.
 */
export const resolveOfflineMapMode = ({ hasPacks, isOnline, preferLocal }: { hasPacks: boolean; isOnline: boolean; preferLocal: boolean }): OfflineMapMode => {
  if (!hasPacks) return 'online';
  if (!isOnline) return 'offline';
  return preferLocal ? 'local-preferred' : 'online';
};

export interface CreateOfflineMapOptionsInput {
  installed: OfflineInstalledSet | null;
  isOnline: boolean;
  /** Overrides the manifest's `PreferLocalInAo`. */
  preferLocal?: boolean;
  composer?: OfflineStyleComposer;
  /** Called the first time a composed style is handed out (LRU bookkeeping). */
  onUse?: (packIds: string[]) => void;
  /**
   * Composed styles keyed by `<revision>:<scheme>`, shared across option objects so a new options object for the same
   * installed revision hands MapLibre the same style object (no restyle).
   */
  styleCache?: Map<string, StyleSpecification | null>;
}

/**
 * Builds `MapProvider`'s `offline` option from the installed set. The style is composed lazily per theme and cached,
 * so `getStyle` is cheap and returns the same object until the installed set changes (no restyle churn).
 */
export function createOfflineMapOptions({ installed, isOnline, preferLocal, composer = offlineStyleComposer, onUse, styleCache = new Map() }: CreateOfflineMapOptionsInput): MapOfflineOptions | null {
  if (!installed || installed.basemapPacks.length === 0) {
    return null;
  }
  const mode = resolveOfflineMapMode({ hasPacks: true, isOnline, preferLocal: preferLocal ?? installed.preferLocal });
  let used = false;
  return {
    mode,
    attribution: installed.attribution || OFFLINE_MAP_ATTRIBUTION,
    updatedAt: installed.updatedAt,
    getStyle: (scheme) => {
      const key = `${installed.revision}:${scheme}`;
      if (!styleCache.has(key)) {
        styleCache.set(
          key,
          composer.compose({
            scheme,
            template: scheme === 'dark' ? (installed.templates.dark ?? installed.templates.light) : (installed.templates.light ?? installed.templates.dark),
            basemapPacks: installed.basemapPacks,
            customMapPacks: installed.customMapPacks,
            glyphsPath: null,
            spritePath: installed.spritePath,
            departmentData: null,
            indoorFloors: installed.indoorFloors,
            attribution: installed.attribution,
          })
        );
      }
      const style = styleCache.get(key) ?? null;
      if (style && !used && mode !== 'online') {
        used = true;
        onUse?.(installed.basemapPacks.map((pack) => pack.packId));
      }
      return style;
    },
  };
}
