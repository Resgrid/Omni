import { describeCallFields } from '@resgrid/features/calls';
import { RecurringCallCreationMode, type RecurringCallErrorData, RecurringCallFrequency, type RecurringCallInput, type RecurringCallOptionsResultData, type RecurringCallResultData } from '@resgrid/models';

import type { Translate } from './schedule-format';

/** Who each occurrence's call is dispatched to. */
export interface RecurringDispatchTargets {
  users: string[];
  groups: string[];
  roles: string[];
  units: string[];
}

/** Who is told when an alert is raised (the schedule's owner when nobody is chosen). */
export interface RecurringAlertRecipients {
  users: string[];
  groups: string[];
  roles: string[];
}

export type MonthlyMode = 'date' | 'weekday';

/** The recurring call form's state: text inputs stay strings until they are sent. */
export interface RecurringCallFormValues {
  name: string;
  description: string;
  frequency: RecurringCallFrequency;
  repeatInterval: string;
  days: number[];
  monthlyMode: MonthlyMode;
  monthlyDay: string;
  monthlyWeek: number;
  monthlyWeekday: number;
  /** "HH:mm" department-local times, sorted. */
  times: string[];
  startsOn: string;
  endsOn: string;
  creationMode: RecurringCallCreationMode;
  leadTimeMinutes: number;
  manualAlertMinutes: number;
  useRunCard: boolean;
  natureOfCall: string;
  notes: string;
  address: string;
  /** "lat,lon", or blank. */
  geoLocationData: string;
  priority: number;
  type: string;
  contactName: string;
  contactNumber: string;
  externalIdentifier: string;
  referenceNumber: string;
  incidentNumber: string;
  mapPage: string;
  destinationPoiId: number | null;
  /** Core M0322: free destination address (no destination POI: a POI wins and clears it). */
  destinationAddress: string;
  /** Core M0322: free destination point, "lat,lon", or blank. */
  destinationGeoLocationData: string;
  /** Core M0322: the route each call runs (an eligible plan from `Routes/GetCallRoutePlans`); null when none. */
  routePlanId: string | null;
  checkInTimersEnabled: boolean;
  scheduleContactName: string;
  scheduleContactNumber: string;
  scheduleContactEmail: string;
  facilityName: string;
  facilityDetails: string;
  facilityPoiId: number | null;
  destinationName: string;
  destinationDetails: string;
  dispatch: RecurringDispatchTargets;
  alertRecipients: RecurringAlertRecipients;
  /** New schedules only: save it paused. */
  startPaused: boolean;
  /** Editing: replace the calls already created that have not gone out. */
  replaceUpcomingCalls: boolean;
}

/** Core's defaults when the options have not loaded (RecurringCallRecurrence). */
const FALLBACK_LEAD_MINUTES = 1440;
const FALLBACK_ALERT_MINUTES = 15;

/** A blank weekly schedule starting today, with the department's default lead time and alert. */
export function emptyRecurringCallForm(options: Pick<RecurringCallOptionsResultData, 'DefaultLeadTimeMinutes' | 'DefaultManualAlertMinutes' | 'Today'> | null, priority: number): RecurringCallFormValues {
  return {
    name: '',
    description: '',
    frequency: RecurringCallFrequency.Weekly,
    repeatInterval: '1',
    days: [],
    monthlyMode: 'date',
    monthlyDay: '1',
    monthlyWeek: 1,
    monthlyWeekday: 1,
    times: [],
    startsOn: options?.Today ?? '',
    endsOn: '',
    creationMode: RecurringCallCreationMode.Automatic,
    leadTimeMinutes: options?.DefaultLeadTimeMinutes || FALLBACK_LEAD_MINUTES,
    manualAlertMinutes: options?.DefaultManualAlertMinutes ?? FALLBACK_ALERT_MINUTES,
    useRunCard: false,
    natureOfCall: '',
    notes: '',
    address: '',
    geoLocationData: '',
    priority,
    type: '',
    contactName: '',
    contactNumber: '',
    externalIdentifier: '',
    referenceNumber: '',
    incidentNumber: '',
    mapPage: '',
    destinationPoiId: null,
    destinationAddress: '',
    destinationGeoLocationData: '',
    routePlanId: null,
    checkInTimersEnabled: false,
    scheduleContactName: '',
    scheduleContactNumber: '',
    scheduleContactEmail: '',
    facilityName: '',
    facilityDetails: '',
    facilityPoiId: null,
    destinationName: '',
    destinationDetails: '',
    dispatch: { users: [], groups: [], roles: [], units: [] },
    alertRecipients: { users: [], groups: [], roles: [] },
    startPaused: false,
    replaceUpcomingCalls: true,
  };
}

const text = (value: string | null | undefined): string => value ?? '';

const ids = (values: readonly (string | number)[] | null | undefined): string[] => (values ?? []).map(String);

const toFrequency = (value: number): RecurringCallFrequency =>
  value === RecurringCallFrequency.Daily ? RecurringCallFrequency.Daily : value === RecurringCallFrequency.Monthly ? RecurringCallFrequency.Monthly : RecurringCallFrequency.Weekly;

/** An existing schedule as the form edits it. */
export function scheduleToFormValues(schedule: RecurringCallResultData): RecurringCallFormValues {
  const base = emptyRecurringCallForm(null, schedule.Priority);

  return {
    ...base,
    name: text(schedule.Name),
    description: text(schedule.Description),
    frequency: toFrequency(schedule.Frequency),
    repeatInterval: String(Math.max(1, schedule.RepeatInterval || 1)),
    days: [...(schedule.Days ?? [])],
    monthlyMode: schedule.MonthlyWeek > 0 ? 'weekday' : 'date',
    monthlyDay: String(schedule.MonthlyDay > 0 ? schedule.MonthlyDay : 1),
    monthlyWeek: schedule.MonthlyWeek > 0 ? schedule.MonthlyWeek : 1,
    monthlyWeekday: schedule.MonthlyWeek > 0 ? schedule.MonthlyWeekday : 1,
    times: [...(schedule.Times ?? [])].sort(),
    startsOn: text(schedule.StartsOn),
    endsOn: text(schedule.EndsOn),
    creationMode: schedule.CreationMode === RecurringCallCreationMode.Dispatcher ? RecurringCallCreationMode.Dispatcher : RecurringCallCreationMode.Automatic,
    leadTimeMinutes: schedule.LeadTimeMinutes || FALLBACK_LEAD_MINUTES,
    manualAlertMinutes: schedule.ManualAlertMinutes,
    useRunCard: schedule.UseRunCard,
    natureOfCall: text(schedule.NatureOfCall),
    notes: text(schedule.Notes),
    address: text(schedule.Address),
    geoLocationData: text(schedule.GeoLocationData),
    type: text(schedule.Type),
    contactName: text(schedule.ContactName),
    contactNumber: text(schedule.ContactNumber),
    externalIdentifier: text(schedule.ExternalIdentifier),
    referenceNumber: text(schedule.ReferenceNumber),
    incidentNumber: text(schedule.IncidentNumber),
    mapPage: text(schedule.MapPage),
    destinationPoiId: schedule.DestinationPoiId ?? null,
    destinationAddress: text(schedule.DestinationAddress),
    destinationGeoLocationData: text(schedule.DestinationGeoLocationData),
    routePlanId: schedule.RoutePlanId?.trim() || null,
    checkInTimersEnabled: schedule.CheckInTimersEnabled,
    scheduleContactName: text(schedule.ScheduleContactName),
    scheduleContactNumber: text(schedule.ScheduleContactNumber),
    scheduleContactEmail: text(schedule.ScheduleContactEmail),
    facilityName: text(schedule.FacilityName),
    facilityDetails: text(schedule.FacilityDetails),
    facilityPoiId: schedule.FacilityPoiId ?? null,
    destinationName: text(schedule.DestinationName),
    destinationDetails: text(schedule.DestinationDetails),
    dispatch: { users: ids(schedule.DispatchUserIds), groups: ids(schedule.DispatchGroupIds), roles: ids(schedule.DispatchRoleIds), units: ids(schedule.DispatchUnitIds) },
    alertRecipients: { users: ids(schedule.AlertUserIds), groups: ids(schedule.AlertGroupIds), roles: ids(schedule.AlertRoleIds) },
  };
}

/** A whole number typed into a field, or null. */
export const parseWholeNumber = (value: string): number | null => (/^\s*\d+\s*$/.test(value) ? Number(value.trim()) : null);

const numericIds = (values: readonly string[]): number[] => values.flatMap((value) => (/^\d+$/.test(value) ? [Number(value)] : []));

const optional = (value: string): string | null => (value.trim() ? value.trim() : null);

/**
 * The form as Core's `RecurringCallInput` (0 for a new schedule). Fields the pattern does not use are sent as zero. A
 * destination POI wins over a free destination (Core M0322 clears it too), so only one goes up.
 */
export function toRecurringCallInput(values: RecurringCallFormValues, recurringCallId: number): RecurringCallInput {
  const isNew = recurringCallId <= 0;
  const destinationIsPoi = values.destinationPoiId !== null && values.destinationPoiId > 0;
  const monthly = values.frequency === RecurringCallFrequency.Monthly;
  const byWeekday = monthly && values.monthlyMode === 'weekday';
  const dispatcher = values.creationMode === RecurringCallCreationMode.Dispatcher;

  return {
    RecurringCallId: isNew ? 0 : recurringCallId,
    Name: values.name.trim(),
    Description: optional(values.description),
    IsActive: isNew ? !values.startPaused : null,
    Frequency: values.frequency,
    RepeatInterval: parseWholeNumber(values.repeatInterval) ?? 0,
    Days: values.frequency === RecurringCallFrequency.Weekly ? [...values.days].sort((a, b) => a - b) : [],
    MonthlyDay: monthly && !byWeekday ? (parseWholeNumber(values.monthlyDay) ?? 0) : 0,
    MonthlyWeek: byWeekday ? values.monthlyWeek : 0,
    MonthlyWeekday: byWeekday ? values.monthlyWeekday : 0,
    Times: [...values.times].sort(),
    StartsOn: values.startsOn,
    EndsOn: optional(values.endsOn),
    LeadTimeMinutes: dispatcher ? null : values.leadTimeMinutes,
    CreationMode: values.creationMode,
    ManualAlertMinutes: dispatcher ? values.manualAlertMinutes : null,
    UseRunCard: values.useRunCard,
    NatureOfCall: optional(values.natureOfCall),
    Notes: optional(values.notes),
    Address: optional(values.address),
    GeoLocationData: optional(values.geoLocationData),
    Priority: values.priority,
    Type: optional(values.type),
    ContactName: optional(values.contactName),
    ContactNumber: optional(values.contactNumber),
    ExternalIdentifier: optional(values.externalIdentifier),
    ReferenceNumber: optional(values.referenceNumber),
    IncidentNumber: optional(values.incidentNumber),
    MapPage: optional(values.mapPage),
    DestinationPoiId: values.destinationPoiId,
    DestinationAddress: destinationIsPoi ? null : optional(values.destinationAddress),
    DestinationGeoLocationData: destinationIsPoi ? null : optional(values.destinationGeoLocationData),
    RoutePlanId: values.routePlanId?.trim() || null,
    CheckInTimersEnabled: values.checkInTimersEnabled,
    ScheduleContactName: optional(values.scheduleContactName),
    ScheduleContactNumber: optional(values.scheduleContactNumber),
    ScheduleContactEmail: optional(values.scheduleContactEmail),
    FacilityName: optional(values.facilityName),
    FacilityDetails: optional(values.facilityDetails),
    FacilityPoiId: values.facilityPoiId,
    DestinationName: optional(values.destinationName),
    DestinationDetails: optional(values.destinationDetails),
    DispatchUserIds: [...values.dispatch.users],
    DispatchGroupIds: numericIds(values.dispatch.groups),
    DispatchUnitIds: numericIds(values.dispatch.units),
    DispatchRoleIds: numericIds(values.dispatch.roles),
    AlertUserIds: [...values.alertRecipients.users],
    AlertGroupIds: numericIds(values.alertRecipients.groups),
    AlertRoleIds: numericIds(values.alertRecipients.roles),
    ReplaceUpcomingCalls: isNew ? undefined : values.replaceUpcomingCalls,
  };
}

/** Core's limits when the options have not loaded. */
const FALLBACK_MAX_TIMES = 24;
const FALLBACK_MAX_INTERVAL = 52;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What the form can tell before sending, as the same keys Core answers with (`ErrorNameRequired`, …), so one table words
 * both. Core checks everything again, including the department's New Call Form Fields.
 */
export function validateRecurringCallForm(values: RecurringCallFormValues, options: Pick<RecurringCallOptionsResultData, 'MaxTimesPerDay' | 'MaxInterval'> | null): string[] {
  const errors: string[] = [];
  const maxTimes = options?.MaxTimesPerDay || FALLBACK_MAX_TIMES;
  const maxInterval = options?.MaxInterval || FALLBACK_MAX_INTERVAL;
  const interval = parseWholeNumber(values.repeatInterval);

  if (!values.name.trim()) errors.push('ErrorNameRequired');

  if (interval === null || interval < 1 || interval > maxInterval) errors.push('ErrorIntervalInvalid');

  if (values.frequency === RecurringCallFrequency.Weekly && values.days.length === 0) errors.push('ErrorDaysRequired');

  if (values.frequency === RecurringCallFrequency.Monthly && values.monthlyMode === 'date') {
    const day = parseWholeNumber(values.monthlyDay);

    if (day === null || day < 1 || day > 31) errors.push('ErrorMonthlyDayInvalid');
  }

  if (values.times.length === 0) errors.push('ErrorTimesRequired');

  if (values.times.length > maxTimes) errors.push('ErrorTooManyTimes');

  if (!values.startsOn) errors.push('ErrorStartsOnRequired');

  if (values.startsOn && values.endsOn && values.endsOn < values.startsOn) errors.push('ErrorEndsBeforeStart');

  if (values.scheduleContactEmail.trim() && !EMAIL.test(values.scheduleContactEmail.trim())) errors.push('ErrorContactEmailInvalid');

  return errors;
}

/** Core's validation keys and the strings that word them. */
const ERROR_LABEL_KEYS = new Map<string, string>([
  ['ErrorNameRequired', 'recurring_calls.errors.name_required'],
  ['ErrorTimesRequired', 'recurring_calls.errors.times_required'],
  ['ErrorTooManyTimes', 'recurring_calls.errors.too_many_times'],
  ['ErrorIntervalInvalid', 'recurring_calls.errors.interval_invalid'],
  ['ErrorFrequencyInvalid', 'recurring_calls.errors.frequency_invalid'],
  ['ErrorDaysRequired', 'recurring_calls.errors.days_required'],
  ['ErrorMonthlyDayInvalid', 'recurring_calls.errors.monthly_day_invalid'],
  ['ErrorMonthlyWeekdayInvalid', 'recurring_calls.errors.monthly_weekday_invalid'],
  ['ErrorEndsBeforeStart', 'recurring_calls.errors.ends_before_start'],
  ['ErrorLeadTimeInvalid', 'recurring_calls.errors.lead_time_invalid'],
  ['ErrorCreationModeInvalid', 'recurring_calls.errors.creation_mode_invalid'],
  ['ErrorManualAlertInvalid', 'recurring_calls.errors.manual_alert_invalid'],
  ['ErrorContactEmailInvalid', 'recurring_calls.errors.contact_email_invalid'],
  ['ErrorStartsOnRequired', 'recurring_calls.errors.starts_on_required'],
  ['ErrorEndsOnInvalid', 'recurring_calls.errors.ends_on_invalid'],
  ['ErrorTimeInvalid', 'recurring_calls.errors.time_invalid'],
  ['ErrorCoordinatesInvalid', 'recurring_calls.errors.coordinates_invalid'],
  ['ErrorDestinationPoiInvalid', 'recurring_calls.errors.destination_poi_invalid'],
  ['ErrorFacilityPoiInvalid', 'recurring_calls.errors.facility_poi_invalid'],
  ['ErrorDestinationCoordinatesInvalid', 'recurring_calls.errors.destination_coordinates_invalid'],
  ['ErrorRoutePlanInvalid', 'recurring_calls.errors.route_plan_invalid'],
  ['ErrorResumeOnInvalid', 'recurring_calls.errors.resume_on_invalid'],
]);

/** The prefix of a New Call Form Fields violation ("NewCallField_address"). */
export const NEW_CALL_FIELD_ERROR_PREFIX = 'NewCallField_';

/** Whether a validation key is one this app words itself (a key it does not know falls back to the server's message). */
export const isKnownSaveErrorKey = (key: string): boolean => ERROR_LABEL_KEYS.has(key) || key.startsWith(NEW_CALL_FIELD_ERROR_PREFIX);

/**
 * One validation error in the user's language: Core's keys are worded here (limits filled in), a New Call Form Fields key
 * names the field the department requires, and an unknown key shows Core's English message.
 */
export function describeSaveError(error: Pick<RecurringCallErrorData, 'Key' | 'Message'>, t: Translate, options: Pick<RecurringCallOptionsResultData, 'MaxTimesPerDay' | 'MaxInterval'> | null): string {
  if (error.Key.startsWith(NEW_CALL_FIELD_ERROR_PREFIX)) {
    return t('recurring_calls.errors.new_call_field', { field: describeCallFields([error.Key.slice(NEW_CALL_FIELD_ERROR_PREFIX.length)], t) });
  }

  const labelKey = ERROR_LABEL_KEYS.get(error.Key);

  if (labelKey) return t(labelKey, { max: error.Key === 'ErrorTooManyTimes' ? options?.MaxTimesPerDay || FALLBACK_MAX_TIMES : options?.MaxInterval || FALLBACK_MAX_INTERVAL });

  return error.Message?.trim() || t('recurring_calls.errors.unknown');
}

/** The form sections an error belongs to, so the field can show it too. */
export type RecurringCallFormField = 'name' | 'pattern' | 'times' | 'dates' | 'mode' | 'contact' | 'call';

const ERROR_FIELDS = new Map<string, RecurringCallFormField>([
  ['ErrorNameRequired', 'name'],
  ['ErrorIntervalInvalid', 'pattern'],
  ['ErrorFrequencyInvalid', 'pattern'],
  ['ErrorDaysRequired', 'pattern'],
  ['ErrorMonthlyDayInvalid', 'pattern'],
  ['ErrorMonthlyWeekdayInvalid', 'pattern'],
  ['ErrorTimesRequired', 'times'],
  ['ErrorTooManyTimes', 'times'],
  ['ErrorTimeInvalid', 'times'],
  ['ErrorStartsOnRequired', 'dates'],
  ['ErrorEndsOnInvalid', 'dates'],
  ['ErrorEndsBeforeStart', 'dates'],
  ['ErrorLeadTimeInvalid', 'mode'],
  ['ErrorCreationModeInvalid', 'mode'],
  ['ErrorManualAlertInvalid', 'mode'],
  ['ErrorContactEmailInvalid', 'contact'],
]);

/** The section an error is shown beside (New Call Form Fields and location errors go with the call's fields). */
export const errorField = (key: string): RecurringCallFormField => ERROR_FIELDS.get(key) ?? 'call';

/** Inserts a time of day once, keeping the list sorted. */
export const addTime = (times: readonly string[], time: string): string[] => (time && !times.includes(time) ? [...times, time].sort() : [...times]);
