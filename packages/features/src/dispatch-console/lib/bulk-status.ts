import { getDestinationTabs, getUnitStatusOptions, NO_DESTINATION, type StatusDestination, statusDetailType, statusNoteType, toBaseTypeNumber, toRespondingTo } from '@resgrid/features/status';
import {
  type CallResultData,
  CustomStateDetailTypes,
  statusDetailAllowsCalls,
  statusDetailAllowsPois,
  statusDetailAllowsStations,
  type StatusesResultData,
  type UnitInfoResultData,
  type UnitTypeStatusResultData,
} from '@resgrid/models';

/** A status every unit of a multi-unit selection can be set to, with each unit's own option for it. */
export interface CommonUnitStatusOption {
  key: string;
  /**
   * What the picker shows and asks for: the first unit's option, offering every destination kind any unit's option
   * offers (Detail) and asking for a note by the strictest of their note rules (Note).
   */
  status: StatusesResultData;
  /** Each unit's own option: the id, destinations and note rule its status set uses. */
  statusByUnitId: Record<string, StatusesResultData>;
}

/**
 * What one bulk status submit sends: the status, the destination picked and the note. After a partial refusal only a retry
 * that sends the same skips the units already saved; a changed destination or note goes to every unit again, so the
 * selection never ends with two destinations or notes for one status.
 */
export const bulkStatusAttemptKey = (optionKey: string, selection: { destination: StatusDestination; note: string }): string => {
  const { respondingTo, respondingToType } = toRespondingTo(selection.destination);

  return JSON.stringify([optionKey, respondingToType, respondingTo, selection.note.trim()]);
};

/** How one status is recognised across status sets: its name, trimmed and lower-cased. */
export const commonStatusKey = (status: Pick<StatusesResultData, 'Text'>): string => (status.Text ?? '').trim().toLowerCase();

interface UnitStatusIndex {
  unitId: string;
  byKey: Map<string, StatusesResultData>;
  /** Options by meaning, only for a BaseType exactly one option of the set has. */
  byUniqueBaseType: Map<number, StatusesResultData>;
}

const indexUnitStatuses = (unitId: string, statuses: readonly StatusesResultData[]): UnitStatusIndex => {
  const byKey = new Map<string, StatusesResultData>();
  const byBaseType = new Map<number, StatusesResultData[]>();

  for (const status of statuses) {
    const key = commonStatusKey(status);

    if (key && !byKey.has(key)) byKey.set(key, status);

    const baseType = toBaseTypeNumber(status.BaseType);

    if (baseType !== null && baseType >= 0) byBaseType.set(baseType, [...(byBaseType.get(baseType) ?? []), status]);
  }

  const byUniqueBaseType = new Map<number, StatusesResultData>();
  byBaseType.forEach((matches, baseType) => {
    if (matches.length === 1) byUniqueBaseType.set(baseType, matches[0]);
  });

  return { unitId, byKey, byUniqueBaseType };
};

/** The Detail offering these destination kinds (Core's values are a list, not bit flags: CallsAndPois is 5). */
const detailOffering = (calls: boolean, stations: boolean, pois: boolean): CustomStateDetailTypes => {
  if (calls && stations && pois) return CustomStateDetailTypes.CallsStationsAndPois;

  if (calls && stations) return CustomStateDetailTypes.CallsAndStations;

  if (calls && pois) return CustomStateDetailTypes.CallsAndPois;

  if (stations && pois) return CustomStateDetailTypes.StationsAndPois;

  if (calls) return CustomStateDetailTypes.Calls;

  if (stations) return CustomStateDetailTypes.Stations;

  return pois ? CustomStateDetailTypes.Pois : CustomStateDetailTypes.None;
};

/** One Detail offering every destination kind any of the statuses offers. */
export const mergeStatusDetails = (statuses: readonly Pick<StatusesResultData, 'Detail'>[]): CustomStateDetailTypes => {
  const details = statuses.map(statusDetailType);

  return detailOffering(
    details.some(statusDetailAllowsCalls),
    details.some((detail) => statusDetailAllowsStations(detail)),
    details.some((detail) => statusDetailAllowsPois(detail))
  );
};

/**
 * The statuses a group of units can all be set to in one action, ordered as the first unit's set. Units of different
 * types can use different custom sets where the "same" status ("At Hospital" for an ambulance and for an MUG) has a
 * different id per set: a status matches the option with the same name, else the one option of that set with the same
 * meaning (BaseType) when the meaning is unambiguous in both sets. Statuses that share a meaning ("Available on Radio"
 * and "Available") stay separate choices. Each unit keeps its own status id; a unit whose set lacks an option removes
 * it from the group's choices.
 */
export function resolveCommonUnitStatusOptions(units: readonly Pick<UnitInfoResultData, 'UnitId' | 'CustomStatusSetId' | 'Type'>[], sets: readonly UnitTypeStatusResultData[]): CommonUnitStatusOption[] {
  if (units.length === 0) return [];
  const indexes = units.map((unit) => indexUnitStatuses(unit.UnitId, getUnitStatusOptions<StatusesResultData, UnitTypeStatusResultData>(sets, unit)));
  const [first, ...rest] = indexes;

  const matchIn = (index: UnitStatusIndex, key: string, status: StatusesResultData): StatusesResultData | undefined => {
    const byName = index.byKey.get(key);

    if (byName) return byName;
    const baseType = toBaseTypeNumber(status.BaseType);

    if (baseType === null || first.byUniqueBaseType.get(baseType) !== status) return undefined;
    const byMeaning = index.byUniqueBaseType.get(baseType);

    // A status the first set has by name is that option's match, never another option's.
    return byMeaning && !first.byKey.has(commonStatusKey(byMeaning)) ? byMeaning : undefined;
  };

  const result: CommonUnitStatusOption[] = [];
  first.byKey.forEach((status, key) => {
    const matches = [{ unitId: first.unitId, status }];

    for (const index of rest) {
      const match = matchIn(index, key, status);

      if (!match) return;
      matches.push({ unitId: index.unitId, status: match });
    }

    const unitStatuses = matches.map((entry) => entry.status);
    result.push({
      key,
      status: { ...status, Detail: mergeStatusDetails(unitStatuses), Note: Math.max(...unitStatuses.map(statusNoteType)) },
      statusByUnitId: Object.fromEntries(matches.map((entry) => [entry.unitId, entry.status])),
    });
  });

  return result;
}

/**
 * The destination one unit of a group is sent for its own status: the chosen destination when that status offers its
 * kind (`lenient` as the picker); for a status without destinations, the chosen call, else the default call, which a
 * single unit's status carries silently too (`resolveEffectiveDestination`); otherwise none.
 */
export const destinationForUnitStatus = (status: Pick<StatusesResultData, 'Detail'>, destination: StatusDestination, defaultCall: CallResultData | null, lenient: boolean): StatusDestination => {
  const detail = statusDetailType(status);

  if (detail === 0) return destination.type === 'call' ? destination : defaultCall ? { type: 'call', call: defaultCall } : NO_DESTINATION;

  return destination.type !== 'none' && getDestinationTabs(detail, lenient).includes(destination.type) ? destination : NO_DESTINATION;
};
