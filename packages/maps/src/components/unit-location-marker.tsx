import React, { useMemo } from 'react';

import { createCirclePolygon, normalizeHeading } from '../lib/camera';
import { useMapIcons } from '../provider/context';
import { CircleLayer, FillLayer, Images, LineLayer, ShapeSource, SymbolLayer } from '../rg';

/**
 * The unit's own position as GL layers (baseline Unit unit-location-marker): accuracy circle (metres, geographic),
 * map-aligned heading chevron, location dot. GL layers always draw, rotate with the map and keep their size at every
 * zoom — view annotations rasterize on iOS and often render blank.
 */

export interface UnitLocationMarkerProps {
  latitude: number;
  longitude: number;
  /** Raw GPS heading (null or -1 when there is no fix). */
  heading: number | null;
  /** Fix accuracy radius in metres, or null. */
  accuracy: number | null;
  color?: string;
  idPrefix?: string;
}

const LOCATION_BLUE = '#3b82f6';

/** 64×56 chevron; used when the app's icon registry has no `direction_arrow` asset. */
export const DIRECTION_ARROW_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAA4CAYAAABNGP5yAAACL0lEQVR42u2ZPU7DQBCFfYMcIUfIAShScgAO4AtwAAokS3RUCxINBQUViihSgpAQUEGFK4REgTuQaCJR5D8smcgLo8Qm61k77G7mSU+y4rWlN57xfoqD4J8kpRTyVyJYJ00DN+SiGutUgDijAPG6hI9U4rvn8cxIke/h61N3IOln70tu7nfl1mFvdpwKztV9LsCNSnpwOZAbe92Z4RjpxtfwoUr4mIx/wivDb0ihb+FrqvVB0PbzBQiPe7gAsLbmUwHaKtnJ7XAhvDKcQ2r7Er6pEr28T3LDK791JrgITR9aP1Fptk/7SwsAa5ASp0cB427rYbQ0vDKsdR6TMe5CW8Oer1sAWIvYwE1Mxri70+prh1eGa5zF5HncLRpe2UlMzsJdagGcxOQ83KXaKUxehrtUO4HJOrhLtROYrIu7VFuNyUVxl2orMZmCu1RbiclU3KXaKkw2wV2qrcJkU9yl2gpMLgt3ncTkMnHXSUwuA3d3zwed66exOLsfCTh2BpNNcBeemrgYJK8fkxBvYXA8LUYI54p200oxmYq7sH8fXQ3bOvACa2At4K91mFwUd1WbU+YTrtEdj5Vgsi7u5rW5SdfpjEelmKyDu0Xa3OQh5I1HpZj8F+6atLnJNpw1HpVgchbult3mZY1HJZiMcRcqXHWbm47H3AsxNr1phLYX4cKfkimlCrRdRyY3ilPwce7zVPriDtMMddINAk/k1ad2FovFYrFYLBaLxWKxWCxTfQPDAf6eowsOPgAAAABJRU5ErkJggg==';

export const UnitLocationMarker: React.FC<UnitLocationMarkerProps> = React.memo(({ latitude, longitude, heading, accuracy, color = LOCATION_BLUE, idPrefix = 'unit-location' }) => {
  const icons = useMapIcons();
  const safeHeading = normalizeHeading(heading);
  const point = useMemo((): GeoJSON.Feature<GeoJSON.Point> => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [longitude, latitude] } }), [longitude, latitude]);
  const accuracyPolygon = useMemo(() => (accuracy != null && Number.isFinite(accuracy) && accuracy > 0 ? createCirclePolygon(longitude, latitude, accuracy) : null), [longitude, latitude, accuracy]);
  const arrowImage = icons.direction_arrow ?? DIRECTION_ARROW_DATA_URI;
  const images = useMemo(() => ({ [`${idPrefix}-arrow`]: arrowImage }), [idPrefix, arrowImage]);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return (
    <>
      {accuracyPolygon ? (
        <ShapeSource id={`${idPrefix}-accuracy`} shape={accuracyPolygon}>
          <FillLayer id={`${idPrefix}-accuracy-fill`} style={{ fillColor: color, fillOpacity: 0.12 }} />
          <LineLayer id={`${idPrefix}-accuracy-outline`} style={{ lineColor: color, lineWidth: 1, lineOpacity: 0.35 }} />
        </ShapeSource>
      ) : null}
      <Images images={images} />
      {safeHeading != null ? (
        <ShapeSource id={`${idPrefix}-heading-source`} shape={point}>
          <SymbolLayer
            id={`${idPrefix}-heading`}
            style={{ iconImage: `${idPrefix}-arrow`, iconSize: 0.55, iconAnchor: 'bottom', iconRotate: safeHeading, iconRotationAlignment: 'map', iconAllowOverlap: true, iconIgnorePlacement: true }}
          />
        </ShapeSource>
      ) : null}
      <ShapeSource id={`${idPrefix}-point`} shape={point}>
        <CircleLayer id={`${idPrefix}-dot`} style={{ circleRadius: 8, circleColor: color, circleStrokeWidth: 3, circleStrokeColor: '#ffffff', circlePitchAlignment: 'map' }} />
      </ShapeSource>
    </>
  );
});

UnitLocationMarker.displayName = 'UnitLocationMarker';
