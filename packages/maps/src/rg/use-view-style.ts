import { useMemo } from 'react';

import { useMapProviderContext } from '../provider/context';
import type { MapStyle } from '../types';
import type { MapViewProps } from './types';

export interface ViewStyle {
  mapStyle: MapStyle | null;
  /** `ready` → draw; `loading` → empty frame; `none` / `error` → unavailable fallback. */
  status: 'loading' | 'ready' | 'none' | 'error';
  attribution: string;
  /** Changes when the base style changes (drives the restyle re-add). */
  styleKey: string;
}

const explicitKey = (style: MapStyle): string => (typeof style === 'string' ? `url:${style}` : `json:${typeof style.name === 'string' ? style.name : ''}:${Object.keys(style.sources ?? {}).join(',')}`);

/** The style a `MapView` draws: its own `mapStyle` / `styleURL`, else the provider's department style. */
export const useViewStyle = (props: Pick<MapViewProps, 'mapStyle' | 'styleURL' | 'attribution'>): ViewStyle => {
  const { style } = useMapProviderContext();
  const explicit = props.mapStyle ?? props.styleURL;
  return useMemo<ViewStyle>(() => {
    const attribution = [style.attribution, props.attribution?.trim() ?? ''].filter((part) => part.length > 0).join(' · ');
    if (explicit) {
      return { mapStyle: explicit, status: 'ready', attribution, styleKey: explicitKey(explicit) };
    }
    return { mapStyle: style.mapStyle, status: style.status, attribution, styleKey: style.styleKey };
  }, [explicit, style, props.attribution]);
};
