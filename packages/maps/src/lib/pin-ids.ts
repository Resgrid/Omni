import type { MapMakerInfoData } from '@resgrid/models';

/**
 * Pin types of `Mapping/GetMapDataAndMarkers` and pin id helpers (ported from the identical legacy `lib/map-pin-ids.ts`).
 */
export const MapPinType = {
  Call: 0,
  Unit: 1,
  Station: 2,
  Personnel: 3,
  Poi: 4,
  Hydrant: 5,
} as const;

// Core prefixes each pin id with its type so ids are unique across types (`c123` is call 123, `p<guid>` a person).
// Servers from before that change send the bare id.
const PIN_ID_PREFIXES: Record<number, string> = {
  [MapPinType.Call]: 'c',
  [MapPinType.Unit]: 'u',
  [MapPinType.Station]: 's',
  [MapPinType.Personnel]: 'p',
  [MapPinType.Poi]: 'poi',
  [MapPinType.Hydrant]: 'hydrant-',
};

const NUMERIC_ID_TYPES = new Set<number>([MapPinType.Call, MapPinType.Unit, MapPinType.Station, MapPinType.Poi]);

type PinIdentity = Pick<MapMakerInfoData, 'Id' | 'Type'>;

/** The entity id behind a pin (the id without its type prefix); legacy unprefixed ids are returned unchanged. */
export const getPinEntityId = (pin: PinIdentity): string => {
  const id = pin.Id == null ? '' : String(pin.Id).trim();
  const prefix = PIN_ID_PREFIXES[pin.Type];
  if (!prefix || id.length <= prefix.length || id.slice(0, prefix.length).toLowerCase() !== prefix) {
    return id;
  }
  const entityId = id.slice(prefix.length);
  if (NUMERIC_ID_TYPES.has(pin.Type) && !/^\d+$/.test(entityId)) {
    return id;
  }
  return entityId;
};

export const isCallPin = (pin: Pick<MapMakerInfoData, 'Type'>): boolean => pin.Type === MapPinType.Call;

/** Whether the pin is the given call, e.g. the active call (stores hold the bare call id). */
export const isPinForCall = (pin: PinIdentity, callId: string | number | null | undefined): boolean => callId != null && String(callId) !== '' && isCallPin(pin) && getPinEntityId(pin) === String(callId);

/** Personnel pins: `Type` 3, or a `Person*` ImagePath from older servers. Hidden from users without `CanViewPII`. */
export const isPersonnelPin = (pin: Pick<MapMakerInfoData, 'Type' | 'ImagePath'>): boolean => pin.Type === MapPinType.Personnel || (!!pin.ImagePath && pin.ImagePath.toLowerCase().startsWith('person'));
