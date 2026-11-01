import type { MapMakerInfoData, PoiResultData, PoiTypeResultData } from '@resgrid/models';

/** POI helpers (baseline: Responder `lib/poi.ts`), shared by the POI markers, list and filter. */

export const POI_MARKER_TYPE = 4;
export const DEFAULT_POI_COLOR = '#2563eb';
export const ALL_POI_TYPES = 'all';

export type PoiSortOption = 'name' | 'type';

/** The web app's `isPoiMarker()`: Type 4, a POI type id, a `poi-type-` layer, or a `map-icon-` icon name. */
export const isPoiMarker = (marker: Pick<MapMakerInfoData, 'Type' | 'PoiTypeId' | 'LayerId' | 'PoiImage' | 'ImagePath'>): boolean => {
  if (marker.Type === POI_MARKER_TYPE) return true;
  if (marker.PoiTypeId != null && marker.PoiTypeId > 0) return true;
  if (marker.LayerId != null && marker.LayerId.toLowerCase().startsWith('poi-type-')) return true;
  const iconField = marker.PoiImage?.trim() || marker.ImagePath;
  return iconField != null && iconField.toLowerCase().startsWith('map-icon-');
};

export interface PoiDisplayable {
  Name?: string | null;
  Address?: string | null;
  Note?: string | null;
  PoiTypeName?: string | null;
}

const text = (value?: string | null): string => value?.trim() ?? '';

export const getPoiDisplayName = (poi: PoiDisplayable): string => text(poi.Name) || text(poi.Address) || text(poi.Note) || text(poi.PoiTypeName);

export const getPoiSelectionLabel = (poi: PoiDisplayable): string => {
  const name = text(poi.Name);
  const address = text(poi.Address);
  return name && address ? `${name} - ${address}` : getPoiDisplayName(poi);
};

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A POI / type colour when it is a hex colour, else the default POI blue. */
export const getPoiColor = (...candidates: (string | null | undefined)[]): string => candidates.map(text).find((color) => HEX_COLOR.test(color)) ?? DEFAULT_POI_COLOR;

export interface PoiFilterOptions {
  poiTypeId: string;
  sortBy: PoiSortOption;
  search: string;
}

/** The list view: type filter (`all` or a type id), free-text search over name/address/note/type, name or type sort. */
export const filterAndSortPois = (pois: readonly PoiResultData[], { poiTypeId, sortBy, search }: PoiFilterOptions): PoiResultData[] => {
  const query = search.trim().toLowerCase();
  const filtered = pois.filter((poi) => {
    if (poiTypeId !== ALL_POI_TYPES && String(poi.PoiTypeId) !== poiTypeId) return false;
    if (!query) return true;
    return [poi.Name, poi.Address, poi.Note, poi.PoiTypeName].some((value) => value?.toLowerCase().includes(query));
  });
  return filtered.sort((left, right) => {
    if (sortBy === 'type') {
      const byType = (left.PoiTypeName || '').localeCompare(right.PoiTypeName || '');
      if (byType !== 0) return byType;
    }
    return getPoiDisplayName(left).localeCompare(getPoiDisplayName(right));
  });
};

export interface PoiTypeGroup {
  poiTypeId: number;
  poiTypeName: string;
  isDestination: boolean;
  color: string;
  imagePath: string;
  marker: string;
  pois: PoiResultData[];
}

export const groupPoisByType = (pois: readonly PoiResultData[], poiTypes: readonly PoiTypeResultData[] = []): PoiTypeGroup[] => {
  const typesById = new Map(poiTypes.map((poiType) => [poiType.PoiTypeId, poiType]));
  const groups = new Map<number, PoiTypeGroup>();
  for (const poi of pois) {
    const existing = groups.get(poi.PoiTypeId);
    if (existing) {
      existing.pois.push(poi);
      continue;
    }
    const poiType = typesById.get(poi.PoiTypeId);
    groups.set(poi.PoiTypeId, {
      poiTypeId: poi.PoiTypeId,
      poiTypeName: poi.PoiTypeName || poiType?.Name || '',
      isDestination: poi.IsDestination || poiType?.IsDestination || false,
      color: getPoiColor(poi.Color, poiType?.Color),
      imagePath: poi.PoiImage || poi.ImagePath || poiType?.PoiImage || poiType?.ImagePath || '',
      marker: poi.Marker || poiType?.Marker || '',
      pois: [poi],
    });
  }
  return Array.from(groups.values()).sort((left, right) => left.poiTypeName.localeCompare(right.poiTypeName));
};

/** POIs as GeoJSON points for `PoiMarkers` (invalid coordinates dropped). */
export const poisToFeatureCollection = (pois: readonly PoiResultData[], poiTypes: readonly PoiTypeResultData[] = []): GeoJSON.FeatureCollection<GeoJSON.Point> => {
  const typesById = new Map(poiTypes.map((poiType) => [poiType.PoiTypeId, poiType]));
  return {
    type: 'FeatureCollection',
    features: pois
      .filter((poi) => Number.isFinite(poi.Latitude) && Number.isFinite(poi.Longitude) && !(poi.Latitude === 0 && poi.Longitude === 0))
      .map((poi) => {
        const poiType = typesById.get(poi.PoiTypeId);
        const iconUrl = text(poi.IconUrl) || text(poiType?.IconUrl);
        return {
          type: 'Feature',
          id: `poi-${poi.PoiId}`,
          geometry: { type: 'Point', coordinates: [poi.Longitude, poi.Latitude] },
          properties: {
            poiId: poi.PoiId,
            poiTypeId: poi.PoiTypeId,
            title: getPoiDisplayName(poi),
            color: getPoiColor(poi.Color, poiType?.Color),
            icon: iconUrl ? `poi-type-${poi.PoiTypeId}` : '',
          },
        };
      }),
  };
};

/** Uploaded POI type icons to register with `Images` (`poi-type-{id}` → URL). */
export const poiTypeIconImages = (poiTypes: readonly PoiTypeResultData[], pois: readonly PoiResultData[] = []): Record<string, string> => {
  const images: Record<string, string> = {};
  for (const poiType of poiTypes) {
    const url = text(poiType.IconUrl);
    if (/^https?:\/\//i.test(url)) images[`poi-type-${poiType.PoiTypeId}`] = url;
  }
  for (const poi of pois) {
    const url = text(poi.IconUrl);
    const key = `poi-type-${poi.PoiTypeId}`;
    if (!images[key] && /^https?:\/\//i.test(url)) images[key] = url;
  }
  return images;
};
