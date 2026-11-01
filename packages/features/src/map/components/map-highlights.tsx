import { CircleLayer, ShapeSource } from '@resgrid/maps';
import React, { useMemo } from 'react';

import { buildHighlightCollection, type HighlightColors, type MapHighlight } from '../lib/map-markers';

export interface MapHighlightsProps {
  targets: readonly MapHighlight[];
  colors: HighlightColors;
  idPrefix?: string;
}

/**
 * Halos under the device's active unit and the active call (Unit's "this is us / this is our call"), drawn as one GL
 * circle layer so they follow live position updates and rotate with the map like the pins they sit under.
 */
export const MapHighlights: React.FC<MapHighlightsProps> = ({ targets, colors, idPrefix = 'map-screen-highlights' }) => {
  const shape = useMemo(() => buildHighlightCollection(targets, colors), [colors, targets]);
  if (targets.length === 0) return null;
  return (
    <ShapeSource id={`${idPrefix}-source`} shape={shape}>
      <CircleLayer
        id={`${idPrefix}-halo`}
        style={{ circleRadius: 22, circleColor: ['get', 'color'], circleOpacity: 0.22, circleStrokeColor: ['get', 'color'], circleStrokeWidth: 2, circleStrokeOpacity: 0.9, circlePitchAlignment: 'map' }}
      />
    </ShapeSource>
  );
};
