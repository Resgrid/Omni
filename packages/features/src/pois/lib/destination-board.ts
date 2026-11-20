/**
 * The dispatcher's Destinations screen (Dispatch): every destination with what it offers and whether it can take a patient
 * now, the department's capabilities with how many destinations offer each and how many cannot provide it now, and the
 * destination rules (read-only; set on the web) that decide which destination a call or a unit is suggested.
 */
import { type DestinationRuleResultData, DestinationSuggestionModes, PoiAvailabilityStatuses, type PoiCapabilityResultData, type PoiResultData } from '@resgrid/models';

import { canPoiProvide, poiAvailabilityStatus, type PoiCapabilityOption, poiCapabilityOptions, poiOffersCapability } from './poi-availability';
import { poiLabel } from './poi-filters';

/** All destinations, or only those not open (limited, diversion, closed). */
export type DestinationStatusFilter = 'all' | 'not_open';

export interface DestinationBoardFilter {
  query: string;
  status: DestinationStatusFilter;
  poiTypeId: number | null;
  capabilityId: string | null;
}

export const EMPTY_DESTINATION_BOARD_FILTER: DestinationBoardFilter = { query: '', status: 'all', poiTypeId: null, capabilityId: null };

/** The destinations the filter keeps, by type name then name. */
export const filterDestinations = (pois: readonly PoiResultData[], filter: DestinationBoardFilter, now: number = Date.now()): PoiResultData[] => {
  const query = filter.query.trim().toLowerCase();

  return pois
    .filter((poi) => {
      if (filter.status === 'not_open' && poiAvailabilityStatus(poi, now) === PoiAvailabilityStatuses.Open) return false;

      if (filter.poiTypeId !== null && poi.PoiTypeId !== filter.poiTypeId) return false;

      if (filter.capabilityId && !poiOffersCapability(poi, filter.capabilityId)) return false;

      if (!query) return true;

      return [poi.Name, poi.Address, poi.PoiTypeName, poi.Note, poi.AvailabilityNote, ...(poi.Capabilities ?? [])].some((value) => !!value && value.toLowerCase().includes(query));
    })
    .sort((a, b) => (a.PoiTypeName ?? '').localeCompare(b.PoiTypeName ?? '') || poiLabel(a).localeCompare(poiLabel(b)));
};

export interface AvailabilityCounts {
  total: number;
  open: number;
  limited: number;
  diversion: number;
  closed: number;
}

/** How many destinations are open, limited, on diversion and closed now. */
export const countAvailability = (pois: readonly PoiResultData[], now: number = Date.now()): AvailabilityCounts => {
  const counts: AvailabilityCounts = { total: pois.length, open: 0, limited: 0, diversion: 0, closed: 0 };

  for (const poi of pois) {
    switch (poiAvailabilityStatus(poi, now)) {
      case PoiAvailabilityStatuses.Limited:
        counts.limited += 1;
        break;
      case PoiAvailabilityStatuses.Diversion:
        counts.diversion += 1;
        break;
      case PoiAvailabilityStatuses.Closed:
        counts.closed += 1;
        break;
      default:
        counts.open += 1;
    }
  }

  return counts;
};

/** The destination POI types among the destinations, once each, by name. */
export const destinationTypeOptions = (pois: readonly PoiResultData[]): { id: number; name: string }[] => {
  const seen = new Map<number, string>();

  for (const poi of pois) {
    if (!seen.has(poi.PoiTypeId)) seen.set(poi.PoiTypeId, poi.PoiTypeName ?? '');
  }

  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
};

export interface CapabilitySummary extends PoiCapabilityOption {
  /** Destinations that offer it. */
  offeredBy: number;
  /** Of those, how many cannot provide it now (closed, or it is reported unavailable). */
  unavailableAt: number;
}

/**
 * The department's capabilities in its order, each with how many destinations offer it and how many of those cannot provide
 * it now; capabilities the destinations name that the department list lacks (an older server) come after, by name.
 */
export const summarizeCapabilities = (capabilities: readonly PoiCapabilityResultData[], pois: readonly PoiResultData[], now: number = Date.now()): CapabilitySummary[] => {
  const options: PoiCapabilityOption[] = [...capabilities].sort((a, b) => a.Sort - b.Sort || a.Name.localeCompare(b.Name)).map((capability) => ({ id: capability.PoiCapabilityId, name: capability.Name }));
  const known = new Set(options.map((option) => option.id.trim().toLowerCase()));
  const extra = new Map<string, PoiCapabilityOption>();

  for (const poi of pois) {
    for (const option of poiCapabilityOptions(poi)) {
      const key = option.id.trim().toLowerCase();

      if (!known.has(key) && !extra.has(key)) extra.set(key, option);
    }
  }

  return [...options, ...[...extra.values()].sort((a, b) => a.name.localeCompare(b.name))].map((option) => {
    const offering = pois.filter((poi) => poiOffersCapability(poi, option.id));

    return {
      ...option,
      offeredBy: offering.length,
      unavailableAt: offering.filter((poi) => !canPoiProvide(poi, option.id, now)).length,
    };
  });
};

/** One condition of a rule: what it names (null when that was deleted since). */
export interface RuleCondition {
  kind: 'call_type' | 'priority' | 'unit_type';
  name: string | null;
}

/** The conditions a rule sets, in the web page's order; none means it applies to every call. */
export const ruleConditions = (rule: DestinationRuleResultData): RuleCondition[] => {
  const conditions: RuleCondition[] = [];

  if (rule.CallTypeId !== null && rule.CallTypeId !== undefined) conditions.push({ kind: 'call_type', name: rule.CallTypeName ?? null });

  if (rule.CallPriority !== null && rule.CallPriority !== undefined) conditions.push({ kind: 'priority', name: rule.CallPriorityName ?? null });

  if (rule.UnitTypeId !== null && rule.UnitTypeId !== undefined) conditions.push({ kind: 'unit_type', name: rule.UnitTypeName ?? null });

  return conditions;
};

/** The i18n key of a rule condition ("Call type: {{name}}"). */
export const ruleConditionLabelKey = (kind: RuleCondition['kind']): string => {
  switch (kind) {
    case 'call_type':
      return 'pois.destinations.rules.condition_call_type';
    case 'priority':
      return 'pois.destinations.rules.condition_priority';
    default:
      return 'pois.destinations.rules.condition_unit_type';
  }
};

/** The i18n key of the destination suggestions setting. */
export const suggestionModeLabelKey = (mode: number | null | undefined): string => {
  switch (Number(mode)) {
    case DestinationSuggestionModes.Suggest:
      return 'pois.destinations.rules.mode_suggest';
    case DestinationSuggestionModes.SuggestAndFill:
      return 'pois.destinations.rules.mode_fill';
    default:
      return 'pois.destinations.rules.mode_off';
  }
};
