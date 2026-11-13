/**
 * Status flow for the StatusPicker (Unit + Responder `lib/status-flow`): which option is current, which options to offer
 * next, and whether a held status can be saved without asking anything more.
 *
 * A department can give each option a list of "next statuses" (`NextIds`). While such a status is current the picker
 * offers only those plus a "Show all statuses" escape. It is a display hint: the server accepts any status.
 */
import { hasBaseType, toBaseTypeNumber } from './base-types';

/** The fields of a status or staffing option the picker reads (StatusesResultData / CustomStatusResultData). */
export interface StatusOption {
  Id: number | string;
  Text: string;
  BColor?: string | null;
  Color?: string | null;
  /** ActionBaseTypes for statuses, StaffingBaseTypes for staffing; -1 / undefined = no meaning. */
  BaseType?: number | null;
  /** GPS required (a live fix is taken at submission). */
  Gps?: boolean | null;
  /** CustomStateNoteTypes: 0 none, 1 optional, 2 required. */
  Note?: number | string | null;
  /** CustomStateDetailTypes: which destinations the option offers. */
  Detail?: number | string | null;
  /** Ids offered next while this option is current (not yet in @resgrid/models; read when the server sends it). */
  NextIds?: (number | string)[] | null;
}

export interface CurrentStatusRef {
  /** The current option's id (v4 `StateId` / personnel `StatusType` / `StatusId`). */
  StateId?: number | string | null;
  /** What the current status means; used when the id does not match an option. */
  BaseType?: number | null;
}

export interface OfferedStatuses<T extends StatusOption> {
  offered: T[];
  isRestricted: boolean;
  hiddenCount: number;
}

export const NOTE_NONE = 0;
export const NOTE_OPTIONAL = 1;
export const NOTE_REQUIRED = 2;

export const toOptionId = (value: number | string | null | undefined): string => (value == null ? '' : String(value).trim());

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const statusNoteType = (status: Pick<StatusOption, 'Note'> | null | undefined): number => toNumber(status?.Note);
export const statusDetailType = (status: Pick<StatusOption, 'Detail'> | null | undefined): number => toNumber(status?.Detail);
export const isNoteRequired = (status: Pick<StatusOption, 'Note'> | null | undefined): boolean => statusNoteType(status) === NOTE_REQUIRED;
export const hasNoteStep = (status: Pick<StatusOption, 'Note'> | null | undefined): boolean => statusNoteType(status) > NOTE_NONE;

/**
 * The id of the option that is the current status, or null. Matches the server's id first; when the id is missing or
 * not in the list (older servers, a status from another set) it falls back to the status MEANING — the one option with
 * the same BaseType — and never to the display text or a hard-coded id.
 */
export const resolveCurrentStatusId = (statuses: readonly StatusOption[] | null | undefined, current: CurrentStatusRef | null | undefined): string | null => {
  if (!statuses || statuses.length === 0 || !current) return null;

  const stateId = toOptionId(current.StateId);
  if (stateId !== '') {
    const byId = statuses.find((status) => toOptionId(status.Id) === stateId);
    if (byId) return toOptionId(byId.Id);
  }

  if (!hasBaseType(current.BaseType)) return null;
  const baseType = toBaseTypeNumber(current.BaseType);
  const byMeaning = statuses.filter((status) => toBaseTypeNumber(status.BaseType) === baseType);
  return byMeaning.length === 1 ? toOptionId(byMeaning[0].Id) : null;
};

/**
 * The options to offer: everything when `showAll`, when the current status is unknown or has no next statuses;
 * otherwise only its next statuses. A list that would come out empty falls back to everything.
 */
export const getOfferedStatuses = <T extends StatusOption>(statuses: readonly T[] | null | undefined, currentStatusId: string | null, showAll: boolean): OfferedStatuses<T> => {
  const all = statuses ? [...statuses] : [];
  if (showAll || !currentStatusId) return { offered: all, isRestricted: false, hiddenCount: 0 };

  const current = all.find((status) => toOptionId(status.Id) === currentStatusId);
  const nextIds = new Set((current?.NextIds ?? []).map((id) => toOptionId(id)).filter((id) => id !== '' && id !== '0'));
  if (nextIds.size === 0) return { offered: all, isRestricted: false, hiddenCount: 0 };

  const offered = all.filter((status) => nextIds.has(toOptionId(status.Id)));
  if (offered.length === 0) return { offered: all, isRestricted: false, hiddenCount: 0 };
  return { offered, isRestricted: true, hiddenCount: all.length - offered.length };
};

/** The StatusPicker's steps; `confirm` restates a status chosen before the sheet opened that needs nothing more. */
export type StatusPickerStep = 'select' | 'destination' | 'note' | 'confirm';

/**
 * The picker's steps in order (the last one submits). A status chosen before the sheet opened — a home or sidebar
 * status button — skips the list, as in Responder and Unit: it opens on its destinations, else its note, else a
 * confirm step, so a single tap never saves on its own. A status picked from the list submits from the list when it
 * needs nothing more. Staffing is the list, then the note when the level takes one.
 */
export const getStatusPickerSteps = (options: { isStaffing: boolean; hasPresetStatus: boolean; hasDestinationStep: boolean; hasNoteStep: boolean }): StatusPickerStep[] => {
  if (options.isStaffing) return options.hasNoteStep ? ['select', 'note'] : ['select'];
  const steps: StatusPickerStep[] = options.hasPresetStatus ? [] : ['select'];
  if (options.hasDestinationStep) steps.push('destination');
  if (options.hasNoteStep) steps.push('note');
  return steps.length > 0 ? steps : ['confirm'];
};

/**
 * Whether a status can be saved the moment it is held: no required note, and either no destination step or a
 * destination step whose call the picker can fill from the active / dispatched call.
 */
export const canSubmitStatusWithoutInput = (status: Pick<StatusOption, 'Detail' | 'Note'> | null | undefined, options: { allowsCalls: boolean; hasDefaultCall: boolean; hasDefaultPoi?: boolean }): boolean => {
  if (!status) return false;
  if (isNoteRequired(status)) return false;
  if (statusDetailType(status) === 0) return true;
  // A transport status pre-selects its call's assigned destination (status-destination `defaultPoi`).
  if (options.hasDefaultPoi) return true;

  return options.allowsCalls && options.hasDefaultCall;
};
