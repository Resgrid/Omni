import { BaseV4Request } from '../baseV4Request';

/**
 * Dispatcher desk ("Dispatchers on duty", Core M0324, `DispatcherDeskController` v4): dispatchers sign in to the desk, the
 * desk routes pending and scheduled calls, texts, emails, chats and held phone calls to a free dispatcher, and dispatchers
 * plan and take breaks against the department's coverage minimum. Field names mirror
 * `Resgrid.Web.Services.Models.v4.DispatcherDesk` exactly (PascalCase). Instants are ISO-8601 UTC; local dates
 * "yyyy-MM-dd". Enums arrive as their integer values; refusals carry the `DispatcherDeskErrors` name in `Error`.
 */

/** Mirrors `DispatcherDisplayStates`: the stored presence with Busy worked out from the work held. */
export enum DispatcherDisplayState {
  Offline = 0,
  Available = 1,
  Busy = 2,
  Away = 3,
  OnBreak = 4,
}

/** Mirrors `DispatcherDutyModes`. */
export enum DispatcherDutyMode {
  /** On a shift's dispatch roster for the shift day running now. */
  Scheduled = 0,
  /** Signed on without a shift (an event, a facility, cover), where the department allows it. */
  Unscheduled = 1,
}

/** Mirrors `ShiftDispatcherSources`. */
export enum ShiftDispatcherSource {
  Assigned = 1,
  Signup = 2,
}

/** Mirrors `DispatcherBreakTypes`. */
export enum DispatcherBreakType {
  Break = 1,
  Meal = 2,
  Personal = 3,
  Other = 4,
}

/** Mirrors `DispatcherBreakStates`. */
export enum DispatcherBreakState {
  Scheduled = 0,
  Active = 1,
  Completed = 2,
  Missed = 3,
  Cancelled = 4,
}

/** Mirrors `DispatcherBreakEndReasons`. */
export enum DispatcherBreakEndReason {
  None = 0,
  Returned = 1,
  AutoReturn = 2,
  Supervisor = 3,
  SignedOff = 4,
}

/** Mirrors `DispatcherQueueItemKinds`. */
export enum DispatcherQueueItemKind {
  PendingCall = 1,
  ScheduledCall = 2,
  Text = 3,
  Voice = 4,
  Email = 5,
  Chat = 6,
  Other = 7,
}

/** Mirrors `DispatcherQueueItemStates`. */
export enum DispatcherQueueItemState {
  /** Waiting in the shared queue: any on-duty dispatcher can take it. */
  Queued = 0,
  /** Offered to one dispatcher (`AssignedUserId`) until `OfferExpiresOn`. */
  Offered = 1,
  /** Taken: the holder is working it. */
  Accepted = 2,
  Completed = 3,
  /** Nobody could take it: it went to the department's overflow handling. */
  Overflowed = 4,
  Cancelled = 5,
}

/** Mirrors `DispatcherQueueItemOutcomes`. */
export enum DispatcherQueueItemOutcome {
  None = 0,
  Dispatched = 1,
  CallCreated = 2,
  LeftPending = 3,
  Duplicate = 4,
  NoActionNeeded = 5,
  Closed = 6,
  Referred = 7,
}

/** Mirrors `DispatcherQueueEventTypes`. */
export enum DispatcherQueueEventType {
  Created = 1,
  Offered = 2,
  Declined = 3,
  OfferExpired = 4,
  Accepted = 5,
  Released = 6,
  Transferred = 7,
  Completed = 8,
  Overflowed = 9,
  Cancelled = 10,
  MessageReceived = 11,
  MessageSent = 12,
  VoiceConnecting = 13,
  VoiceConnected = 14,
  VoiceEnded = 15,
  Escalated = 16,
  Reopened = 17,
  /** The intake text thread linked to the item closed (idle, STOP, the call closed, someone ended it). */
  ConversationClosed = 18,
}

/** Mirrors `DispatcherMessageDirections`. */
export enum DispatcherMessageDirection {
  Inbound = 1,
  Outbound = 2,
  /** A desk note, never sent anywhere. */
  Note = 3,
}

/** Mirrors `DispatcherMessageDeliveryStates`. */
export enum DispatcherMessageDeliveryState {
  Received = 0,
  Queued = 1,
  Sent = 2,
  Failed = 3,
}

/** Mirrors `IntakeConversationStates` (Core M0325). */
export enum IntakeThreadState {
  Open = 1,
  Closed = 2,
}

/** Mirrors `IntakeConversationHandlers`: who answers the texter right now. */
export enum IntakeThreadHandler {
  /** Enhanced AI asks the follow-up questions. */
  Assistant = 1,
  /** Nobody automated: the texter waits for a dispatcher. */
  Unassisted = 2,
  Dispatcher = 3,
}

/** Mirrors `IntakeConversationAuthors`. */
export enum IntakeMessageAuthor {
  Participant = 1,
  Assistant = 2,
  Dispatcher = 3,
  /** Resgrid's own texts: welcome, connected, closed. */
  System = 4,
}

/** Mirrors `IntakeConversationMessageStatuses`. */
export enum IntakeMessageStatus {
  Received = 1,
  Queued = 2,
  Sent = 3,
  Failed = 4,
}

/** Mirrors `DispatcherEmailCallModes`. */
export enum DispatcherEmailCallMode {
  AutoDispatch = 0,
  Pending = 1,
  EnhancedAi = 2,
}

/** `DispatcherDeskErrors` names, as `DispatcherDeskActionResult.Error` carries them (append only on the server). */
export const DISPATCHER_DESK_ERRORS = [
  'DeskDisabled',
  'NotADispatcher',
  'NotOnDuty',
  'NotSignedIn',
  'ItemNotFound',
  'ItemNotAvailable',
  'NotAssignedToYou',
  'AtCapacity',
  'HoldingWork',
  'BreakNotFound',
  'BreakNotStartable',
  'AlreadyOnBreak',
  'NotOnBreak',
  'CoverageTooLow',
  'NotPermitted',
  'InvalidInput',
  'ChannelUnavailable',
  'NoCallbackNumber',
  'ShiftNotFound',
  'DispatchersNotEnabled',
  'AlreadyOnRoster',
  'BreakOverlaps',
] as const;

export type DispatcherDeskErrorName = (typeof DISPATCHER_DESK_ERRORS)[number];

/** `DispatcherDeskWarningKinds` names, as `DispatcherDeskWarningData.Kind` carries them. */
export const DISPATCHER_DESK_WARNING_KINDS = ['CoverageBelowMinimum', 'BreaksOverlap', 'OutsideDuty', 'NoCoverage', 'WorkReturnedToQueue', 'StartedLate', 'StartedEarly'] as const;

export type DispatcherDeskWarningKind = (typeof DISPATCHER_DESK_WARNING_KINDS)[number];

/** Something a desk action noticed that never blocks it (coverage below the minimum, work returned to the queue…). */
export interface DispatcherDeskWarningData {
  /** `DispatcherDeskWarningKinds` name. */
  Kind: string;
  StartUtc: string | null;
  EndUtc: string | null;
  UserIds: string[];
  Available: number | null;
  Minimum: number | null;
  /** Minutes early or late (StartedEarly / StartedLate). */
  Minutes: number | null;
}

/** One entry of a break plan: type and minutes. */
export interface DispatcherBreakPlanEntryData {
  /** `DispatcherBreakType`. */
  BreakType: number;
  DurationMinutes: number;
  /** Minutes after the shift day starts; null = spread evenly. */
  TargetOffsetMinutes: number | null;
}

/** The department's desk settings the app needs (a subset of `DispatcherDeskConfig`). */
export interface DispatcherDeskConfigData {
  Enabled: boolean;
  RequireShift: boolean;
  AllowUnscheduledDuty: boolean;
  MaxActiveItemsPerDispatcher: number;
  OfferTimeoutSeconds: number;
  BreakReminderMinutes: number;
  AutoReturnAfterMinutes: number;
  MinimumAvailableDispatchers: number;
  PreventBreakBelowMinimum: boolean;
  SuppressAlertsOnBreak: boolean;
  RouteText: boolean;
  RouteVoice: boolean;
  RouteEmail: boolean;
  RouteChat: boolean;
  RoutePendingCalls: boolean;
  RouteScheduledCalls: boolean;
  /** `DispatcherEmailCallMode`. */
  EmailCallMode: number;
  /** The default break plan (shown when planning or taking a break). */
  DefaultBreakPlan: DispatcherBreakPlanEntryData[];
}

/** A dispatcher's place on a shift day's dispatch roster. */
export interface DispatcherDutyData {
  UserId: string;
  ShiftId: number;
  ShiftDayId: number;
  ShiftName: string | null;
  ShiftColor: string | null;
  /** The shift day's local date, "yyyy-MM-dd". */
  Day: string | null;
  StartUtc: string | null;
  EndUtc: string | null;
  IsSupervisor: boolean;
  /** `ShiftDispatcherSource`. */
  Source: number;
  IsPending: boolean;
  ShiftDispatcherId: string | null;
}

/** A planned, running or finished break. A break is a length: due back `DurationMinutes` after it starts. */
export interface DispatcherBreakData {
  DispatcherBreakId: string;
  UserId: string;
  UserName: string | null;
  ShiftId: number | null;
  ShiftDayId: number | null;
  /** `DispatcherBreakType`. */
  BreakType: number;
  /** `DispatcherBreakState`. */
  State: number;
  ScheduledStartOn: string | null;
  /** ScheduledStartOn + DurationMinutes. */
  ScheduledEndOn: string | null;
  DurationMinutes: number;
  StartedOn: string | null;
  /** StartedOn + DurationMinutes: when the dispatcher is due back. */
  ExpectedReturnOn: string | null;
  EndedOn: string | null;
  /** `DispatcherBreakEndReason`. */
  EndReason: number;
  Note: string | null;
}

/** A dispatcher as the desk shows them (the caller's own entry is `Me`). */
export interface DispatcherDeskMemberData {
  UserId: string;
  Name: string | null;
  /** `DispatcherDisplayState`. */
  DisplayState: number;
  IsSignedIn: boolean;
  IsOnDuty: boolean;
  IsSupervisor: boolean;
  /** `DispatcherDutyMode`. */
  DutyMode: number;
  Duty: DispatcherDutyData | null;
  /** When the duty ends (shift day end, or the chosen end of unscheduled duty); null = open. */
  DutyEndsOn: string | null;
  SignedInOn: string | null;
  StateChangedOn: string | null;
  LastSeenOn: string | null;
  AwayReason: string | null;
  CallbackNumber: string | null;
  /** phone, tablet or desktop. */
  DeviceKind: string | null;
  ActiveBreak: DispatcherBreakData | null;
  NextBreak: DispatcherBreakData | null;
  ActiveItemCount: number;
  OfferedItemCount: number;
  Capacity: number;
  OverdueMinutes: number;
  /** The caller may supervise other dispatchers (end their breaks, reassign their work). */
  CanSupervise: boolean;
}

/** A routed piece of work: a pending or scheduled call, a text, email or chat conversation, a held phone call. */
export interface DispatcherQueueItemData {
  DispatcherQueueItemId: string;
  /** `DispatcherQueueItemKind`. */
  Kind: number;
  /** `DispatcherQueueItemState`. */
  State: number;
  /** `DispatcherQueueItemOutcome`. */
  Outcome: number;
  CallId: number | null;
  CallNumber: string | null;
  CallName: string | null;
  CallPriority: number | null;
  CallPriorityColor: string | null;
  Priority: number;
  SourceAddress: string | null;
  SourceName: string | null;
  TargetAddress: string | null;
  Subject: string | null;
  Preview: string | null;
  AssignedUserId: string | null;
  AssignedUserName: string | null;
  OfferedOn: string | null;
  OfferExpiresOn: string | null;
  OfferAttempts: number;
  AcceptedOn: string | null;
  CompletedOn: string | null;
  DueOn: string | null;
  CreatedOn: string | null;
  LastActivityOn: string | null;
  OverflowedOn: string | null;
  OverflowNote: string | null;
  EscalatedOn: string | null;
  Note: string | null;
  /** Voice: a held caller is waiting now (not hung up). */
  CallerWaiting: boolean;
  /** Messages in the conversation (text, email, chat). */
  MessageCount: number;
  /** Messages received since the holder last replied. */
  UnreadCount: number;
  /**
   * An intake text thread the item is linked to (a text to the department's private inbound dispatch number): its messages come in
   * `DispatcherQueueItemDetailData.IntakeConversation`, replies go out from the region's master number. Absent on a Core
   * without intake.
   */
  IntakeConversationId?: string | null;
}

/** One step in an item's history. */
export interface DispatcherQueueEventData {
  /** `DispatcherQueueEventType`. */
  EventType: number;
  UserId: string | null;
  UserName: string | null;
  OccurredOn: string | null;
  Detail: string | null;
}

/** One message of a desk conversation (or a desk note). */
export interface DispatcherConversationMessageData {
  DispatcherConversationMessageId: string;
  /** `DispatcherMessageDirection`. */
  Direction: number;
  FromAddress: string | null;
  ToAddress: string | null;
  Body: string | null;
  UserId: string | null;
  UserName: string | null;
  CreatedOn: string | null;
  /** `DispatcherMessageDeliveryState`. */
  DeliveryState: number;
  Error: string | null;
}

/** An item with its history and conversation (`GET DispatcherDesk/GetItem`). */
export interface DispatcherQueueItemDetailData {
  Item: DispatcherQueueItemData | null;
  Events: DispatcherQueueEventData[];
  Messages: DispatcherConversationMessageData[];
  /** Whether a reply can be sent on the item's channel. */
  CanReply: boolean;
  /** Whether the desk can ring the dispatcher's phone for this item (voice configured). */
  CanConnectVoice: boolean;
  /** The intake text thread linked to the item, with its messages (null or absent for other items). */
  IntakeConversation?: DispatcherIntakeThreadData | null;
}

/** An intake text thread on a desk item (Core `IntakeConversation`, M0325). */
export interface DispatcherIntakeThreadData {
  IntakeConversationId: string;
  /** `IntakeThreadState`. */
  State: number;
  /** `IntakeThreadHandler`. */
  Handler: number;
  AssignedUserId: string | null;
  AssignedUserName: string | null;
  /** The texter sent STOP: nothing more can be sent. */
  OptedOut: boolean;
  ParticipantName: string | null;
  /** The number replies go out from (the region's master number). */
  ReplyFromAddress: string | null;
  StartedOn: string | null;
  ClosedOn: string | null;
  CloseReason: string | null;
  /** Oldest first. */
  Messages: DispatcherIntakeMessageData[];
}

/** One message of an intake text thread (its text is a call note, read for the viewer). */
export interface DispatcherIntakeMessageData {
  MessageId: string;
  /** `DispatcherMessageDirection` values 1 Inbound, 2 Outbound. */
  Direction: number;
  /** `IntakeMessageAuthor`. */
  Author: number;
  AuthorUserId: string | null;
  /** The dispatcher's first name, for dispatcher messages. */
  AuthorName: string | null;
  Text: string | null;
  /** `IntakeMessageStatus`. */
  Status: number;
  CreatedOn: string | null;
}

/** `GET DispatcherDesk/GetDesk`: the whole board. */
export interface DispatcherDeskResultData {
  Enabled: boolean;
  GeneratedOn: string | null;
  Config: DispatcherDeskConfigData | null;
  Me: DispatcherDeskMemberData | null;
  Members: DispatcherDeskMemberData[];
  Queue: DispatcherQueueItemData[];
  /** The caller's open breaks today (active first, then planned). */
  MyBreaks: DispatcherBreakData[];
  MinimumAvailable: number;
  AvailableCount: number;
  OnBreakCount: number;
  OnDutyCount: number;
  BelowMinimum: boolean;
  /** The caller is allowed to use the desk (Dispatch app login). */
  IsDispatcher: boolean;
}

export class DispatcherDeskResult extends BaseV4Request {
  public Data: DispatcherDeskResultData | null = null;
}

export class DispatcherQueueResult extends BaseV4Request {
  public Data: DispatcherQueueItemData[] = [];
}

export class DispatcherQueueItemDetailResult extends BaseV4Request {
  public Data: DispatcherQueueItemDetailData | null = null;
}

/** One coverage slot of the timeline. */
export interface DispatcherCoverageSlotData {
  StartUtc: string;
  EndUtc: string;
  OnDuty: number;
  OnBreak: number;
  Available: number;
  Minimum: number;
  BelowMinimum: boolean;
  BreaksOverlap: boolean;
}

/** `GET DispatcherDesk/GetCoverage`: duty windows, breaks and coverage slots for the timeline. */
export interface DispatcherCoverageResultData {
  FromUtc: string | null;
  ToUtc: string | null;
  SlotMinutes: number;
  Duty: DispatcherDutyData[];
  Breaks: DispatcherBreakData[];
  Slots: DispatcherCoverageSlotData[];
  Warnings: DispatcherDeskWarningData[];
  /** Display names of every dispatcher in Duty/Breaks. */
  Names: Record<string, string>;
}

export class DispatcherCoverageResult extends BaseV4Request {
  public Data: DispatcherCoverageResultData | null = null;
}

/** A shift's dispatcher settings and roster (`GET DispatcherDesk/GetShiftDispatchers`). */
export interface ShiftDispatchersResultData {
  ShiftId: number;
  IsEnabled: boolean;
  IsDispatchOnly: boolean;
  RequiredDispatchers: number;
  MinimumOnDesk: number;
  AllowSelfScheduledBreaks: boolean;
  BreakPlan: DispatcherBreakPlanEntryData[];
  /** The day's roster when a shift day was asked for, else the standing roster. */
  Dispatchers: DispatcherDutyData[];
  Names: Record<string, string>;
  /** The caller can sign up for the asked day (Signup shift, eligible, not on it yet). */
  CanSignup: boolean;
  IsSignedUp: boolean;
}

export class ShiftDispatchersResult extends BaseV4Request {
  public Data: ShiftDispatchersResultData | null = null;
}

/** One dispatcher's activity over a period (supervisors). */
export interface DispatcherDeskStatsData {
  UserId: string;
  Name: string | null;
  Offered: number;
  Accepted: number;
  Declined: number;
  OffersMissed: number;
  Completed: number;
  Dispatched: number;
  AverageSecondsToAccept: number | null;
  AverageSecondsToComplete: number | null;
  Breaks: number;
  BreakMinutes: number;
  BreaksOverdue: number;
  OverdueMinutes: number;
  BreaksMissed: number;
}

/** `GET DispatcherDesk/GetStats` (supervisors). */
export interface DispatcherQueueStatsData {
  Created: number;
  Completed: number;
  Overflowed: number;
  Cancelled: number;
  Escalated: number;
  AverageSecondsToAnswer: number | null;
  /** Kind (`DispatcherQueueItemKind` value as string) → count. */
  CreatedByKind: Record<string, number>;
  Dispatchers: DispatcherDeskStatsData[];
}

export class DispatcherStatsResult extends BaseV4Request {
  public Data: DispatcherQueueStatsData | null = null;
}

export class DispatcherDeskConfigResult extends BaseV4Request {
  public Data: DispatcherDeskConfigData | null = null;
}

export class DispatcherBreaksResult extends BaseV4Request {
  public Data: DispatcherBreakData[] = [];
}

/** What every desk POST answers: success or the refusal, the caller's desk member after it, and what it acted on. */
export class DispatcherDeskActionResult extends BaseV4Request {
  public Success: boolean = false;
  /** `DispatcherDeskErrors` name when refused ("HoldingWork", "CoverageTooLow", …); empty on success. */
  public Error: string | null = null;
  public Warnings: DispatcherDeskWarningData[] = [];
  /** The caller's desk member after the action. */
  public Me: DispatcherDeskMemberData | null = null;
  public Item: DispatcherQueueItemData | null = null;
  public Break: DispatcherBreakData | null = null;
  public Message: DispatcherConversationMessageData | null = null;
}

// ---- Inputs ----

export interface DispatcherSignInInput {
  /** phone, tablet or desktop. */
  DeviceKind: string;
  CallbackNumber?: string | null;
  Unscheduled?: boolean;
  /** ISO UTC end of unscheduled duty; null = until signed off. */
  DutyEndsOn?: string | null;
  StartAway?: boolean;
}

export interface DispatcherAwayInput {
  Reason?: string | null;
}

export interface DispatcherCallbackNumberInput {
  CallbackNumber: string | null;
}

export interface DispatcherDeviceInput {
  /** 1 iOS, 2 Android, 3 web (as Devices/RegisterDevice). */
  Platform: number;
  Token: string;
}

export interface DispatcherItemInput {
  ItemId: string;
}

export interface DispatcherDeclineInput {
  ItemId: string;
  Reason?: string | null;
}

export interface DispatcherTransferInput {
  ItemId: string;
  ToUserId: string;
  Note?: string | null;
}

export interface DispatcherCompleteInput {
  ItemId: string;
  /** `DispatcherQueueItemOutcome`. */
  Outcome: number;
  CallId?: number | null;
  Note?: string | null;
  /** An intake text thread: tell the texter the conversation ended (Core defaults to true). */
  NotifyParticipant?: boolean | null;
}

export interface DispatcherLinkCallInput {
  ItemId: string;
  CallId: number;
}

export interface DispatcherMessageInput {
  ItemId: string;
  Body: string;
}

export interface DispatcherVoiceInput {
  ItemId: string;
  /** Ring this number (E.164); empty = the desk callback number, else the profile mobile. */
  CallbackNumber?: string | null;
}

export interface DispatcherSaveBreakInput {
  /** Empty to plan a new break. */
  DispatcherBreakId?: string | null;
  /** Whose break; empty = the caller. Someone else's needs supervisor rights. */
  UserId?: string | null;
  ShiftDayId?: number | null;
  BreakType: number;
  /** ISO UTC planned start. */
  ScheduledStartOn: string;
  DurationMinutes: number;
  Note?: string | null;
}

export interface DispatcherBreakIdInput {
  DispatcherBreakId: string;
}

export interface DispatcherStartBreakInput {
  /** The planned break to start; empty to take one now (BreakType + DurationMinutes). */
  DispatcherBreakId?: string | null;
  BreakType?: number | null;
  DurationMinutes?: number | null;
  /** Put held work back in the queue (otherwise a dispatcher holding work is refused with HoldingWork). */
  ReturnWork?: boolean;
  /** Whose break; empty = the caller (supervisor for someone else). */
  UserId?: string | null;
}

export interface DispatcherEndBreakInput {
  /** Whose break; empty = the caller (supervisor for someone else). */
  UserId?: string | null;
}

export interface DispatcherPlanBreaksInput {
  ShiftDayId: number;
  Replace: boolean;
}

export interface ShiftDayDispatcherInput {
  ShiftDayId: number;
  /** Assign/remove: whose; empty = the caller (signup/withdraw). */
  UserId?: string | null;
  IsSupervisor?: boolean;
  Note?: string | null;
}
