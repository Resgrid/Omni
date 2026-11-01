import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { getPinEntityId, isPersonnelPin, isPoiMarker, MapPinType } from '@resgrid/maps';
import type { MapMakerInfoData } from '@resgrid/models';

import { MAP_FOCUS_PARAMS } from '../routes';

/**
 * Pure helpers behind the department map screen: what kind of thing a pin is, which pins the layer toggles leave on,
 * the POI-type layers the department's pins carry, the focus a `/map?callId=` link asks for and the halos for the
 * device's active unit and active call. No React, no stores — the screen and the tests share them.
 */

export type MapMarkerKind = 'call' | 'unit' | 'personnel' | 'station' | 'poi' | 'hydrant' | 'other';

/** Pin kinds the layers sheet can hide, in the order the sheet lists them. */
export const TOGGLEABLE_MARKER_KINDS = ['call', 'unit', 'personnel', 'station', 'poi', 'hydrant'] as const;
export type ToggleableMarkerKind = (typeof TOGGLEABLE_MARKER_KINDS)[number];

/**
 * A pin's kind. Personnel first — older servers mark people only by a `Person*` image — so a member's pin is always
 * treated as personal data (hidden without `CanViewPII`); then POIs (type, POI type id or POI layer), then the type.
 */
export const markerKindOf = (pin: Pick<MapMakerInfoData, 'Type' | 'ImagePath' | 'PoiTypeId' | 'LayerId' | 'PoiImage'>): MapMarkerKind => {
  if (isPersonnelPin(pin)) return 'personnel';
  if (isPoiMarker(pin)) return 'poi';
  switch (pin.Type) {
    case MapPinType.Call:
      return 'call';
    case MapPinType.Unit:
      return 'unit';
    case MapPinType.Station:
      return 'station';
    case MapPinType.Hydrant:
      return 'hydrant';
    default:
      return 'other';
  }
};

const isToggleable = (kind: MapMarkerKind): kind is ToggleableMarkerKind => (TOGGLEABLE_MARKER_KINDS as readonly string[]).includes(kind);

/** The kinds present among the pins (personnel only with `CanViewPII`), in sheet order. */
export const presentMarkerKinds = (pins: readonly MapMakerInfoData[], canViewPersonnel: boolean): ToggleableMarkerKind[] => {
  const present = new Set<ToggleableMarkerKind>();
  for (const pin of pins) {
    const kind = markerKindOf(pin);
    if (isToggleable(kind) && (kind !== 'personnel' || canViewPersonnel)) present.add(kind);
  }
  return TOGGLEABLE_MARKER_KINDS.filter((kind) => present.has(kind));
};

export interface PoiTypeLayer {
  /** Layer toggle id (`poi:<PoiTypeId>`). */
  id: string;
  poiTypeId: number;
  name: string;
  color: string;
}

export const poiTypeLayerId = (poiTypeId: number): string => `poi:${poiTypeId}`;

/** One toggle per POI type the department's POI pins carry (Dispatch POI layers), sorted by name. */
export const poiTypeLayers = (pins: readonly MapMakerInfoData[]): PoiTypeLayer[] => {
  const byType = new Map<number, PoiTypeLayer>();
  for (const pin of pins) {
    if (markerKindOf(pin) !== 'poi' || pin.PoiTypeId == null || pin.PoiTypeId <= 0 || byType.has(pin.PoiTypeId)) continue;
    const name = pin.PoiTypeName?.trim() || pin.LayerName?.trim() || String(pin.PoiTypeId);
    byType.set(pin.PoiTypeId, { id: poiTypeLayerId(pin.PoiTypeId), poiTypeId: pin.PoiTypeId, name, color: pin.Color?.trim() || '' });
  }
  return Array.from(byType.values()).sort((a, b) => a.name.localeCompare(b.name));
};

export interface MarkerFilter {
  /** Kinds switched off in the layers sheet. */
  hiddenKinds: Readonly<Partial<Record<ToggleableMarkerKind, boolean>>>;
  /** POI type layer ids (`poi:<id>`) switched off. */
  hiddenPoiTypes: Readonly<Record<string, boolean>>;
  /** From the rights DTO (`CanViewPII`): false drops every personnel pin. */
  canViewPersonnel: boolean;
}

/** The pins the map draws after the layer toggles and the personal-data right. */
export const filterMarkers = (pins: readonly MapMakerInfoData[], { hiddenKinds, hiddenPoiTypes, canViewPersonnel }: MarkerFilter): MapMakerInfoData[] =>
  pins.filter((pin) => {
    const kind = markerKindOf(pin);
    if (kind === 'personnel' && !canViewPersonnel) return false;
    if (isToggleable(kind) && hiddenKinds[kind] === true) return false;
    if (kind === 'poi' && pin.PoiTypeId != null && hiddenPoiTypes[poiTypeLayerId(pin.PoiTypeId)] === true) return false;
    return true;
  });

// ---------------------------------------------------------------------------------------------------------------
// Focus (`/map?callId=12`)

export type MapFocusKind = 'call' | 'unit' | 'personnel' | 'poi';

export interface MapFocus {
  kind: MapFocusKind;
  id: string;
}

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

const firstParam = (value: string | string[] | undefined): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
};

/** The focus a map link asks for; the first usable parameter wins (call, unit, member, POI). Unsafe ids are ignored. */
export const parseMapFocus = (params: SearchParams): MapFocus | null => {
  for (const kind of ['call', 'unit', 'personnel', 'poi'] as const) {
    const value = firstParam(params[MAP_FOCUS_PARAMS[kind]]);
    if (value === null || !isSafeRouteId(value)) continue;
    if (kind === 'poi' && !/^[1-9]\d*$/.test(value)) continue;
    return { kind, id: value };
  }
  return null;
};

const FOCUS_KIND_TO_MARKER: Record<MapFocusKind, MapMarkerKind> = { call: 'call', unit: 'unit', personnel: 'personnel', poi: 'poi' };

/** The pin for an entity (person ids compare case-insensitively: they are GUIDs). */
export const findEntityPin = (pins: readonly MapMakerInfoData[], kind: MapFocusKind, id: string | number | null | undefined): MapMakerInfoData | null => {
  if (id === null || id === undefined || String(id).trim() === '') return null;
  const wanted = String(id).trim().toLowerCase();
  const markerKind = FOCUS_KIND_TO_MARKER[kind];
  return pins.find((pin) => markerKindOf(pin) === markerKind && getPinEntityId(pin).toLowerCase() === wanted) ?? null;
};

export const findFocusPin = (pins: readonly MapMakerInfoData[], focus: MapFocus | null): MapMakerInfoData | null => (focus ? findEntityPin(pins, focus.kind, focus.id) : null);

// ---------------------------------------------------------------------------------------------------------------
// Active unit / active call halos (Unit highlights its own unit and the crew's call; Responder its active call)

export type MapHighlightRole = 'activeCall' | 'activeUnit';

export interface MapHighlight {
  role: MapHighlightRole;
  pin: MapMakerInfoData;
}

export interface HighlightOptions {
  activeCallId: string | null;
  /** Only where the device reports status for a unit (`status.subject === 'unit'`). */
  activeUnitId: string | null;
}

export const highlightTargets = (pins: readonly MapMakerInfoData[], { activeCallId, activeUnitId }: HighlightOptions): MapHighlight[] => {
  const targets: MapHighlight[] = [];
  const call = findEntityPin(pins, 'call', activeCallId);
  if (call) targets.push({ role: 'activeCall', pin: call });
  const unit = findEntityPin(pins, 'unit', activeUnitId);
  if (unit) targets.push({ role: 'activeUnit', pin: unit });
  return targets;
};

export interface HighlightColors {
  activeCall: string;
  activeUnit: string;
}

/** The halos as one GeoJSON source (a circle layer draws them under the pins). */
export const buildHighlightCollection = (targets: readonly MapHighlight[], colors: HighlightColors): GeoJSON.FeatureCollection<GeoJSON.Point, { role: MapHighlightRole; color: string }> => ({
  type: 'FeatureCollection',
  features: targets.map((target) => ({
    type: 'Feature',
    id: `${target.role}-${String(target.pin.Id)}`,
    geometry: { type: 'Point', coordinates: [target.pin.Longitude, target.pin.Latitude] },
    properties: { role: target.role, color: colors[target.role] },
  })),
});
