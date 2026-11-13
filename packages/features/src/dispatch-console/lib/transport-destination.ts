import { isTransportBaseType } from '@resgrid/features/status';
import { type CallResultData, DestinationEntityTypes, type UnitInfoResultData } from '@resgrid/models';

/**
 * The call's assigned destination a unit is NOT heading to, for the console row's warning (transport destination checks):
 * the unit's current status is a transport status (Transporting / At Hospital) pointing at a POI, its working call
 * (`ActiveCallId`) names an assigned destination (`DestinationPoiId`), and the two differ. Returns the assigned
 * destination's name (address when unnamed), or null when there is nothing to flag.
 */
export const unitTransportDestinationMismatch = (
  unit: Pick<UnitInfoResultData, 'CurrentDestinationId' | 'CurrentDestinationType' | 'CurrentStatusBaseType' | 'ActiveCallId'>,
  callsById: ReadonlyMap<string, Pick<CallResultData, 'DestinationPoiId' | 'DestinationName' | 'DestinationAddress'>>
): string | null => {
  if (Number(unit.CurrentDestinationType) !== DestinationEntityTypes.Poi || !isTransportBaseType(unit.CurrentStatusBaseType)) return null;

  const destinationId = Number(unit.CurrentDestinationId);

  if (!Number.isFinite(destinationId) || destinationId <= 0 || !unit.ActiveCallId) return null;

  const call = callsById.get(String(unit.ActiveCallId));
  const assignedId = call?.DestinationPoiId == null ? NaN : Number(call.DestinationPoiId);

  if (!call || !Number.isFinite(assignedId) || assignedId <= 0 || assignedId === destinationId) return null;

  return call.DestinationName?.trim() || call.DestinationAddress?.trim() || `#${assignedId}`;
};

/** Calls keyed by CallId, for per-row lookups. */
export const indexCallsById = <T extends Pick<CallResultData, 'CallId'>>(calls: readonly T[]): Map<string, T> => new Map(calls.map((call) => [String(call.CallId), call]));
