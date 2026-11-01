import { type PoiResultData } from '@resgrid/models';

export interface PoiListFilter {
  query: string;
  /** 0 / null = every type. */
  poiTypeId: number | null;
  /** Capability keys the POI must offer (Dispatch; POIs without the server field never match a capability filter). */
  capabilities: readonly string[];
  destinationOnly: boolean;
}

export const EMPTY_POI_FILTER: PoiListFilter = { query: '', poiTypeId: null, capabilities: [], destinationOnly: false };

/** What a POI is called on screen: its name, else its address, else its type. */
export const poiLabel = (poi: Pick<PoiResultData, 'Name' | 'Address' | 'PoiTypeName'>): string => poi.Name?.trim() || poi.Address?.trim() || poi.PoiTypeName || '';

export const filterPois = (pois: readonly PoiResultData[], filter: PoiListFilter): PoiResultData[] => {
  const needle = filter.query.trim().toLowerCase();
  return pois.filter((poi) => {
    if (filter.poiTypeId && poi.PoiTypeId !== filter.poiTypeId) return false;
    if (filter.destinationOnly && !poi.IsDestination) return false;
    if (filter.capabilities.length > 0 && !filter.capabilities.every((capability) => (poi.Capabilities ?? []).includes(capability))) return false;
    if (!needle) return true;
    return [poi.Name, poi.Address, poi.Note, poi.PoiTypeName].some((value) => (value ?? '').toLowerCase().includes(needle));
  });
};

/** Every capability key the loaded POIs offer, sorted (drives the capability chips; empty on servers without the field). */
export const collectPoiCapabilities = (pois: readonly PoiResultData[]): string[] => [...new Set(pois.flatMap((poi) => poi.Capabilities ?? []))].sort((a, b) => a.localeCompare(b));

/** A POI id from a route param: a positive integer, else null. */
export const parsePoiId = (value: string | string[] | undefined | null): number | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || !/^\d{1,10}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
};
