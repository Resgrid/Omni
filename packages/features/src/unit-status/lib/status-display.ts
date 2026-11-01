import type { QueuedUnitStatus } from '@resgrid/data';
import { resolveCurrentStatusId, type StatusOption, toOptionId } from '@resgrid/features/status';
import type { UnitInfoResultData, UnitStatusResultData } from '@resgrid/models';

/**
 * Bootstrap label classes that `UnitStatus/GetUnitStatus` still sends in `StateStyle` for built-in statuses instead
 * of a colour (Unit `status-sidebar`). An empty value means "no colour" (the card keeps its neutral background).
 */
export const STATE_STYLE_COLORS: Readonly<Record<string, string>> = {
  'label-danger': '#ED5565',
  'label-info': '#23c6c8',
  'label-warning': '#f8ac59',
  'label-success': '#449d44',
  'label-onscene': '#449d44',
  'label-primary': '#228BCB',
  'label-returning': '',
  'label-default': '#262626',
  'label-enroute': '#449d44',
};

const COLOR_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A status colour from a `StateStyle` value: a known label class, a hex colour (with or without #), else null. */
export const statusStyleColor = (style: string | null | undefined): string | null => {
  const value = style?.trim() ?? '';
  if (value === '') return null;
  if (Object.prototype.hasOwnProperty.call(STATE_STYLE_COLORS, value)) return STATE_STYLE_COLORS[value] || null;
  if (COLOR_PATTERN.test(value)) return value.startsWith('#') ? value : `#${value}`;
  if (/^rgba?\(/i.test(value)) return value;
  return null;
};

export interface UnitStatusDisplay {
  /** The option id that is current (null when it cannot be matched — never guessed from the text). */
  statusId: string | null;
  text: string | null;
  color: string | null;
  /** ActionBaseTypes meaning of the current status; null when unknown. */
  baseType: number | null;
  /** A newer status is queued on this device. */
  isPending: boolean;
  /** The queued status's name, when its option is known. */
  pendingText: string | null;
  destinationName: string | null;
  timestampUtc: string | null;
}

export interface UnitStatusDisplayInput {
  statuses: readonly StatusOption[];
  unitInfo?: Pick<UnitInfoResultData, 'CurrentStatusId' | 'CurrentStatus' | 'CurrentStatusColor' | 'CurrentStatusBaseType' | 'CurrentDestinationName' | 'CurrentStatusTimestampUtc'> | null;
  currentStatus?: Pick<UnitStatusResultData, 'StateId' | 'State' | 'StateStyle' | 'DestinationName' | 'TimestampUtc'> | null;
  pending?: Pick<QueuedUnitStatus, 'statusType'> | null;
}

const text = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

const numberOrNull = (value: number | null | undefined): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * What the console shows as the unit's current status: the server's current status (`GetUnitStatus`), falling back to
 * the unit roster row (`GetUnitsInfos`), matched to the unit's status set by id and then by meaning (BaseType) — never
 * by text. The colour comes from the matched option, then the roster colour, then the legacy `StateStyle` class.
 */
export function resolveUnitStatusDisplay({ statuses, unitInfo, currentStatus, pending }: UnitStatusDisplayInput): UnitStatusDisplay {
  const stateId = currentStatus?.StateId ?? (text(unitInfo?.CurrentStatusId) ? unitInfo?.CurrentStatusId : null) ?? null;
  const statusId = resolveCurrentStatusId(statuses, { StateId: stateId, BaseType: unitInfo?.CurrentStatusBaseType ?? null });
  const option = statusId ? statuses.find((status) => toOptionId(status.Id) === statusId) : undefined;
  const pendingOption = pending ? statuses.find((status) => toOptionId(status.Id) === toOptionId(pending.statusType)) : undefined;

  return {
    statusId,
    text: text(currentStatus?.State) ?? text(unitInfo?.CurrentStatus) ?? text(option?.Text),
    color: text(option?.BColor) ?? text(unitInfo?.CurrentStatusColor) ?? statusStyleColor(currentStatus?.StateStyle),
    baseType: numberOrNull(unitInfo?.CurrentStatusBaseType) ?? numberOrNull(option?.BaseType),
    isPending: !!pending,
    pendingText: text(pendingOption?.Text),
    destinationName: text(currentStatus?.DestinationName) ?? text(unitInfo?.CurrentDestinationName),
    timestampUtc: text(currentStatus?.TimestampUtc) ?? text(unitInfo?.CurrentStatusTimestampUtc),
  };
}
