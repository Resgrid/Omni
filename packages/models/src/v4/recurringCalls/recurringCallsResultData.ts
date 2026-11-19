import { BaseV4Request } from '../baseV4Request';

/**
 * Recurring calls (Core M0319/M0320, `RecurringCallsController` v4): calls dispatched on a schedule, the scheduled calls
 * calendar and the alerts dispatchers act on. Field names mirror `Resgrid.Web.Services.Models.v4.RecurringCalls` exactly
 * (PascalCase). Dates are "yyyy-MM-dd" and times "HH:mm" in the department's time zone; instants (dispatch times,
 * occurrences, alerts) are ISO-8601 UTC. An occurrence is identified by its schedule id and its `OccurrenceOn` instant.
 */

/** Mirrors `RecurringCall.Frequency`. */
export enum RecurringCallFrequency {
  Daily = 1,
  Weekly = 2,
  Monthly = 3,
}

/** Mirrors `RecurringCall.CreationMode`. */
export enum RecurringCallCreationMode {
  /** The system creates each call `LeadTimeMinutes` ahead and dispatches it when due. */
  Automatic = 0,
  /** Nothing is created: a `DispatchDue` alert is raised `ManualAlertMinutes` before each occurrence and a dispatcher sends it. */
  Dispatcher = 1,
}

/** Monthly by weekday: `MonthlyWeek` 1-4, or 5 for the last. */
export const RECURRING_CALL_LAST_WEEK = 5;

/** Mirrors `RecurringCallAlertKinds` (the alert's `KindId`). */
export enum RecurringCallAlertKind {
  CreateFailed = 1,
  Missed = 2,
  NoResources = 3,
  ResourcesUnavailable = 4,
  DispatchDue = 5,
}

/** Mirrors `ScheduledCallCalendarEntryKinds` (the entry's `KindId`). */
export enum ScheduledCallCalendarEntryKind {
  /** A scheduled call waiting for its dispatch time. */
  Scheduled = 1,
  /** A call a recurring schedule created that has gone out. */
  Dispatched = 2,
  /** A call a recurring schedule created that was closed before it went out. */
  Cancelled = 3,
  /** An occurrence whose call is not created yet. */
  Projected = 4,
  /** An occurrence a dispatcher skipped. */
  Skipped = 5,
  /** Dispatcher mode: due and waiting for a dispatcher to send it. */
  Due = 6,
  /** Its time passed with no call created. */
  Missed = 7,
  /** A call a recurring schedule created that is held as pending (nobody could be sent). */
  Held = 8,
}

/** A recurring call schedule (`RecurringCallResultData`). */
export interface RecurringCallResultData {
  RecurringCallId: number;
  Name: string | null;
  Description: string | null;
  IsActive: boolean;
  /** Past its end date: it will never run again. */
  HasEnded: boolean;
  /** 1 Daily, 2 Weekly, 3 Monthly (`RecurringCallFrequency`). */
  Frequency: number;
  RepeatInterval: number;
  /** Weekly: the `System.DayOfWeek` values it runs on (0 = Sunday). */
  Days: number[];
  /** Monthly by date (1-31); 0 when monthly by weekday. */
  MonthlyDay: number;
  /** Monthly by weekday: 1-4, or 5 for the last; 0 when monthly by date. */
  MonthlyWeek: number;
  MonthlyWeekday: number;
  /** "HH:mm" department-local times. */
  Times: string[];
  StartsOn: string | null;
  EndsOn: string | null;
  LeadTimeMinutes: number;
  /** 0 Automatic, 1 Dispatcher (`RecurringCallCreationMode`). */
  CreationMode: number;
  ManualAlertMinutes: number;
  UseRunCard: boolean;

  // The call each occurrence creates
  NatureOfCall: string | null;
  Notes: string | null;
  Address: string | null;
  /** "lat,lon". */
  GeoLocationData: string | null;
  Priority: number;
  Type: string | null;
  ContactName: string | null;
  ContactNumber: string | null;
  ExternalIdentifier: string | null;
  ReferenceNumber: string | null;
  IncidentNumber: string | null;
  MapPage: string | null;
  DestinationPoiId: number | null;
  CheckInTimersEnabled: boolean;

  // About the schedule
  ScheduleContactName: string | null;
  ScheduleContactNumber: string | null;
  ScheduleContactEmail: string | null;
  FacilityName: string | null;
  FacilityDetails: string | null;
  FacilityPoiId: number | null;
  DestinationName: string | null;
  DestinationDetails: string | null;

  // Who
  DispatchUserIds: string[];
  DispatchGroupIds: number[];
  DispatchUnitIds: number[];
  DispatchRoleIds: number[];
  AlertUserIds: string[];
  AlertGroupIds: number[];
  AlertRoleIds: number[];

  // Pause
  /** ISO UTC; null while running. */
  PausedOn: string | null;
  PausedByUserId: string | null;
  PausedByName: string | null;
  PauseReason: string | null;
  /** "yyyy-MM-dd" (department time) it resumes by itself; null to stay paused. */
  ResumeOn: string | null;

  CreatedByUserId: string | null;
  CreatedByName: string | null;
  /** ISO UTC. */
  CreatedOn: string | null;
  UpdatedOn: string | null;

  /** The next time a call goes out (ISO UTC): a waiting call or an occurrence still to come; null when none. */
  NextDispatchOn: string | null;
  OpenAlertCount: number;
  /** The viewer may edit, pause, resume or delete it (its creator or a department admin who can create calls). */
  CanManage: boolean;
}

/** Response of `/RecurringCalls/GetRecurringCalls`: every schedule of the department, paused ones included. */
export class RecurringCallsResult extends BaseV4Request {
  public Data: RecurringCallResultData[] = [];
}

/** A call a schedule created that has not gone out (waiting or held). */
export interface RecurringCallUpcomingCallData {
  CallId: number;
  Number: string | null;
  Name: string | null;
  /** ISO UTC. */
  DispatchOn: string | null;
  /** Held as pending (nobody could be sent). */
  IsHeld: boolean;
}

/** One schedule with what is coming up. */
export interface RecurringCallDetailResultData {
  RecurringCall: RecurringCallResultData;
  /** The next dispatch times (ISO UTC), at most six. */
  NextDispatches: string[];
  UpcomingCalls: RecurringCallUpcomingCallData[];
}

/** Response of `/RecurringCalls/GetRecurringCall` (HTTP 404 when the schedule does not exist). */
export class RecurringCallResult extends BaseV4Request {
  public Data: RecurringCallDetailResultData | null = null;
}

/** What a recurring call form needs to know. */
export interface RecurringCallOptionsResultData {
  CanCreate: boolean;
  IsDepartmentAdmin: boolean;
  /** Run cards are turned on (`UseRunCard` does something). */
  RunCardsEnabled: boolean;
  /** The department's time zone (a Windows zone name; the times and dates are in it). */
  TimeZone: string | null;
  /** Today in the department's time zone, "yyyy-MM-dd". */
  Today: string | null;
  DefaultLeadTimeMinutes: number;
  MinLeadTimeMinutes: number;
  MaxLeadTimeMinutes: number;
  LeadTimeChoices: number[];
  DefaultManualAlertMinutes: number;
  MaxManualAlertMinutes: number;
  ManualAlertChoices: number[];
  MaxTimesPerDay: number;
  MaxInterval: number;
}

/** Response of `/RecurringCalls/GetRecurringCallOptions`. */
export class RecurringCallOptionsResult extends BaseV4Request {
  public Data: RecurringCallOptionsResultData | null = null;
}

/** Creates (`RecurringCallId` 0) or updates a schedule (`RecurringCallInput`). Lists left out are empty. */
export interface RecurringCallInput {
  RecurringCallId: number;
  Name: string;
  Description?: string | null;
  /** New schedules only: false to save it paused. Use Pause/Resume for an existing one. */
  IsActive?: boolean | null;
  Frequency: number;
  RepeatInterval: number;
  Days?: number[];
  MonthlyDay?: number;
  MonthlyWeek?: number;
  MonthlyWeekday?: number;
  Times: string[];
  StartsOn: string;
  EndsOn?: string | null;
  LeadTimeMinutes?: number | null;
  CreationMode: number;
  ManualAlertMinutes?: number | null;
  UseRunCard: boolean;

  NatureOfCall?: string | null;
  Notes?: string | null;
  Address?: string | null;
  GeoLocationData?: string | null;
  Priority: number;
  Type?: string | null;
  ContactName?: string | null;
  ContactNumber?: string | null;
  ExternalIdentifier?: string | null;
  ReferenceNumber?: string | null;
  IncidentNumber?: string | null;
  MapPage?: string | null;
  DestinationPoiId?: number | null;
  CheckInTimersEnabled: boolean;

  ScheduleContactName?: string | null;
  ScheduleContactNumber?: string | null;
  ScheduleContactEmail?: string | null;
  FacilityName?: string | null;
  FacilityDetails?: string | null;
  FacilityPoiId?: number | null;
  DestinationName?: string | null;
  DestinationDetails?: string | null;

  DispatchUserIds?: string[];
  DispatchGroupIds?: number[];
  DispatchUnitIds?: number[];
  DispatchRoleIds?: number[];
  AlertUserIds?: string[];
  AlertGroupIds?: number[];
  AlertRoleIds?: number[];

  /** Updating: delete and re-create the calls already created that have not gone out (server default true). */
  ReplaceUpcomingCalls?: boolean;
}

export interface SaveRecurringCallResultData {
  RecurringCallId: number;
  CreatedCalls: number;
  ReplacedCalls: number;
}

/**
 * Why a schedule was not saved: a stable key the client words itself ("ErrorDaysRequired", "ErrorStartsOnRequired",
 * "NewCallField_address", ...) with an English message.
 */
export interface RecurringCallErrorData {
  Key: string;
  Message: string | null;
}

/** Response of `/RecurringCalls/SaveRecurringCall`; HTTP 400 with `Errors` when it cannot be saved. */
export class SaveRecurringCallResult extends BaseV4Request {
  public Data: SaveRecurringCallResultData | null = null;
  public Errors: RecurringCallErrorData[] = [];
}

export interface PauseRecurringCallInput {
  RecurringCallId: number;
  Reason?: string | null;
  /** "yyyy-MM-dd" in the department's time zone; null to stay paused. */
  ResumeOn?: string | null;
  DeleteUpcomingCalls: boolean;
}

export interface RecurringCallIdInput {
  RecurringCallId: number;
}

export interface DeleteRecurringCallInput {
  RecurringCallId: number;
  DeleteUpcomingCalls: boolean;
}

/** Acts on one occurrence of a schedule. */
export interface RecurringCallOccurrenceInput {
  RecurringCallId: number;
  /** The occurrence, ISO-8601 UTC, as the calendar and alerts give it. */
  OccurrenceOn: string;
}

/** Response of Pause/Resume/Delete and the alert actions. */
export class RecurringCallActionResult extends BaseV4Request {
  public Success: boolean = false;
  public Message: string | null = null;
  public Data: RecurringCallResultData | null = null;
}

/** What an occurrence action did. */
export interface RecurringCallOccurrenceResultData {
  /** Dispatched, Held (nobody could be sent; pending), NotWaiting, QueueFailed, NotCreated, Created, Skipped, NotSkipped, Restored or NotRestored. */
  Outcome: string | null;
  CallId: number | null;
  CallNumber: string | null;
  /** The call's state: 0 active (scheduled or sent), 8 pending. */
  CallState: number | null;
  UnavailableUnitIds: number[];
  UnavailableUserIds: string[];
  RunCardApplied: boolean;
}

/** Response of SkipOccurrence, RestoreOccurrence, CreateOccurrenceCall and DispatchOccurrenceNow. */
export class RecurringCallOccurrenceResult extends BaseV4Request {
  public Success: boolean = false;
  public Data: RecurringCallOccurrenceResultData | null = null;
}

/** One entry of the scheduled calls calendar. */
export interface ScheduledCallCalendarEntryData {
  /** Scheduled, Dispatched, Cancelled, Projected, Skipped, Due, Missed or Held. */
  Kind: string;
  /** `ScheduledCallCalendarEntryKind`. */
  KindId: number;
  /** When it goes (went) out, ISO UTC. */
  DispatchOn: string;
  /** The same in the department's time zone, "yyyy-MM-ddTHH:mm:ss" without an offset. */
  DispatchOnLocal: string;
  /** The occurrence it stands for (ISO UTC), for entries of a recurring schedule; the key of the occurrence actions. */
  OccurrenceOn: string | null;
  Name: string | null;
  Priority: number;
  Address: string | null;
  CallId: number | null;
  CallNumber: string | null;
  RecurringCallId: number | null;
  ScheduleName: string | null;
}

/** Response of `/RecurringCalls/GetScheduledCallsCalendar`. */
export class ScheduledCallsCalendarResult extends BaseV4Request {
  public Data: ScheduledCallCalendarEntryData[] = [];
}

/** A unit or member named on an alert. */
export interface RecurringCallAlertResourceData {
  Id: string;
  Name: string | null;
}

/** Something about one occurrence a dispatcher has to act on. */
export interface RecurringCallAlertResultData {
  AlertId: string;
  RecurringCallId: number;
  ScheduleName: string | null;
  DispatcherMode: boolean;
  ScheduleDeleted: boolean;
  /** CreateFailed, Missed, NoResources, ResourcesUnavailable or DispatchDue. */
  Kind: string;
  /** `RecurringCallAlertKind`. */
  KindId: number;
  /** NoneChosen, NoneAvailable, SaveFailed or DepartmentUnavailable, when there is one. */
  Reason: string | null;
  /** ISO UTC: the occurrence (the key of the occurrence actions). */
  OccurrenceOn: string;
  /** The occurrence in the department's time zone, "yyyy-MM-ddTHH:mm:ss". */
  OccurrenceOnLocal: string | null;
  CallId: number | null;
  CallNumber: string | null;
  CallState: number | null;
  CallDispatched: boolean;
  UnavailableUnits: RecurringCallAlertResourceData[];
  UnavailablePeople: RecurringCallAlertResourceData[];
  /** ISO UTC. */
  CreatedOn: string | null;
  AcknowledgedOn: string | null;
  AcknowledgedByUserId: string | null;
  AcknowledgedByName: string | null;
  IsOpen: boolean;
  ResolvedOn: string | null;
  Resolution: string | null;
  ResolvedByName: string | null;
  ResolutionNote: string | null;
  /** The occurrence has no call: it can be sent (DispatchOccurrenceNow), created or skipped. */
  CanSend: boolean;
  /** The viewer may act on it (send, skip, acknowledge, dismiss): anyone who can create calls. */
  CanAct: boolean;
}

/** Response of `/RecurringCalls/GetRecurringCallAlerts`. */
export class RecurringCallAlertsResult extends BaseV4Request {
  public Data: RecurringCallAlertResultData[] = [];
}

export interface RecurringCallAlertInput {
  AlertId: string;
  /** Dismiss: why (optional). */
  Note?: string | null;
}
