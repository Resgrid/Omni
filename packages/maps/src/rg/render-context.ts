import { createContext, useContext } from 'react';

export interface MapRenderContextValue {
  /**
   * Bumped after every style swap (theme change, online/offline switch) and whenever `MapView.styleRevision` changes.
   * Sources, layers and images re-add themselves when it changes, because a style swap drops everything added on top.
   */
  styleRevision: number;
}

export const MapRenderContext = createContext<MapRenderContextValue>({ styleRevision: 0 });

/** The current style revision of the enclosing `MapView` (0 outside a map). */
export const useStyleRevision = (): number => useContext(MapRenderContext).styleRevision;
