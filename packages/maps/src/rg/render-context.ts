import { createContext, useContext } from 'react';

export interface MapRenderContextValue {
  /**
   * Bumped after every style swap (theme change, online/offline switch) and whenever `MapView.styleRevision` changes.
   * Sources, layers and images re-add themselves when it changes, because a style swap drops everything added on top.
   */
  styleRevision: number;
  /**
   * Native: the layer `belowLabels` layers go under — the base style's first symbol layer when the style is a JSON
   * document, else the wrapper's empty overlay anchor (added before any app layer, so such layers at least stay under
   * everything the app draws). Null on web, which finds the labels in the live style.
   */
  belowLabelsLayerId?: string | null;
}

export const MapRenderContext = createContext<MapRenderContextValue>({ styleRevision: 0 });

/** The current style revision of the enclosing `MapView` (0 outside a map). */
export const useStyleRevision = (): number => useContext(MapRenderContext).styleRevision;

/** See `MapRenderContextValue.belowLabelsLayerId`. */
export const useBelowLabelsLayerId = (): string | null => useContext(MapRenderContext).belowLabelsLayerId ?? null;

/** The id of a style document's first symbol layer (labels), or null for a URL or a style without labels. */
export const firstSymbolLayerId = (style: unknown): string | null => {
  if (!style || typeof style !== 'object') return null;
  const layers = (style as { layers?: unknown }).layers;
  if (!Array.isArray(layers)) return null;
  for (const layer of layers) {
    if (layer && typeof layer === 'object' && (layer as { type?: unknown }).type === 'symbol' && typeof (layer as { id?: unknown }).id === 'string') return (layer as { id: string }).id;
  }
  return null;
};
