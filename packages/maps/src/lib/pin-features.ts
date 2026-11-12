import type { MapMakerInfoData } from '@resgrid/models';

import type { MapIconRegistry, MapIconSource } from '../provider/context';
import { getPinEntityId, isPersonnelPin, MapPinType } from './pin-ids';
import { isPoiMarker } from './poi';

/**
 * Pins → GeoJSON + a generated image sprite. Hundreds of pins (Dispatch, BigBoard) draw as ONE symbol layer: every
 * distinct icon is registered once as a style image (`Images`) and each feature references it by name, instead of one
 * React view per pin (the legacy MarkerView-per-pin approach). The icon of a pin follows the legacy marker chain:
 * uploaded type/role icon (`IconUrl`) → status/priority pin (`PinIconUrl`) → bundled `ImagePath` icon → default.
 */

const HTTP_URL = /^https?:\/\/\S+$/i;

/** An absolute http(s) URL, else null (blank, relative or other schemes are never loaded). */
export const getRemoteIconUrl = (value?: string | null): string | null => {
  const url = value?.trim();
  return url && HTTP_URL.test(url) ? url : null;
};

/** Short stable hash for image names (djb2, base 36). */
export const hashString = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
};

/**
 * Core stores every uploaded type / role / station icon as a 128 px square (`TypeIcons.StoredSize`) meant to be drawn at
 * the 32 px map pin size (`TypeIcons.MapSize`). A symbol layer draws a style image at its own pixel size times
 * `icon-size`, and the bundled and status pins are already 32 px (32 x 37), so only an upload needs scaling down.
 */
const UPLOADED_ICON_STORED_SIZE = 128;
const MAP_PIN_ICON_SIZE = 32;
export const UPLOADED_ICON_SCALE = MAP_PIN_ICON_SIZE / UPLOADED_ICON_STORED_SIZE;

export interface PinIcon {
  /** Style image name. */
  name: string;
  source: MapIconSource;
  /** Multiplier on the layer's `icon-size` that draws this image at the map pin size. */
  scale: number;
}

/** The bundled icon key for a pin (`PoiImage` wins over `ImagePath`), when the registry has it. */
export const bundledIconKey = (pin: Pick<MapMakerInfoData, 'ImagePath' | 'PoiImage' | 'Type'>, icons: MapIconRegistry): string | null => {
  const raw = (pin.PoiImage?.trim() || pin.ImagePath?.trim() || '').toLowerCase();
  if (raw && icons[raw] !== undefined) return raw;
  const fallback = pin.Type === MapPinType.Poi ? 'flag' : 'call';
  return icons[fallback] !== undefined ? fallback : null;
};

/** The icon a pin draws with, or null when nothing is available (the pin then draws as a coloured circle). */
export const resolvePinIcon = (pin: Pick<MapMakerInfoData, 'IconUrl' | 'PinIconUrl' | 'ImagePath' | 'PoiImage' | 'Type'>, icons: MapIconRegistry): PinIcon | null => {
  const upload = getRemoteIconUrl(pin.IconUrl);
  if (upload) return { name: `pin-upload-${hashString(upload)}`, source: upload, scale: UPLOADED_ICON_SCALE };
  const styled = getRemoteIconUrl(pin.PinIconUrl);
  if (styled) return { name: `pin-styled-${hashString(styled)}`, source: styled, scale: 1 };
  const key = bundledIconKey(pin, icons);
  return key ? { name: `pin-bundled-${key}`, source: icons[key], scale: 1 } : null;
};

export interface PinFeatureProperties {
  pinId: string;
  entityId: string;
  type: number;
  title: string;
  icon: string;
  /** The icon's `PinIcon.scale` (1 without an icon); the symbol layer multiplies its `icon-size` by it. */
  iconScale: number;
  color: string;
  sortKey: number;
  isPoi: boolean;
}

export interface PinCollection {
  features: GeoJSON.FeatureCollection<GeoJSON.Point, PinFeatureProperties>;
  /** Style images to register (`Images`), deduplicated. */
  images: Record<string, MapIconSource>;
  /** Pins by id, for press lookups. */
  byId: Map<string, MapMakerInfoData>;
}

export interface PinCollectionOptions {
  icons: MapIconRegistry;
  /** False hides personnel pins (users without `CanViewPII`). */
  canViewPersonnel: boolean;
  /** Excluded from the symbol layer (drawn as a MarkerView instead). */
  selectedPinId?: string | null;
}

const isUsablePosition = (pin: MapMakerInfoData): boolean =>
  Number.isFinite(pin.Latitude) && Number.isFinite(pin.Longitude) && Math.abs(pin.Latitude) <= 90 && Math.abs(pin.Longitude) <= 180 && !(pin.Latitude === 0 && pin.Longitude === 0);

export const buildPinCollection = (pins: readonly MapMakerInfoData[], { icons, canViewPersonnel, selectedPinId }: PinCollectionOptions): PinCollection => {
  const images: Record<string, MapIconSource> = {};
  const byId = new Map<string, MapMakerInfoData>();
  const features: GeoJSON.Feature<GeoJSON.Point, PinFeatureProperties>[] = [];
  for (const pin of pins) {
    if (!isUsablePosition(pin)) continue;
    if (!canViewPersonnel && isPersonnelPin(pin)) continue;
    const pinId = String(pin.Id);
    byId.set(pinId, pin);
    if (selectedPinId != null && pinId === selectedPinId) continue;
    const icon = resolvePinIcon(pin, icons);
    if (icon) images[icon.name] = icon.source;
    features.push({
      type: 'Feature',
      id: pinId,
      geometry: { type: 'Point', coordinates: [pin.Longitude, pin.Latitude] },
      properties: {
        pinId,
        entityId: getPinEntityId(pin),
        type: pin.Type,
        title: pin.Title ?? '',
        icon: icon?.name ?? '',
        iconScale: icon?.scale ?? 1,
        color: pin.Color?.trim() || '#3b82f6',
        sortKey: Number.isFinite(pin.zIndex) ? pin.zIndex : 0,
        isPoi: isPoiMarker(pin),
      },
    });
  }
  return { features: { type: 'FeatureCollection', features }, images, byId };
};
