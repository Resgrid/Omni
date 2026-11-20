import type { PoiResultData } from './poiResultData';

/**
 * A destination's availability (Core `PoiAvailabilityStatuses`, M0315): open destinations have no report, and an expired
 * report reads as open.
 */
export enum PoiAvailabilityStatuses {
  Open = 0,
  /** Taking patients, but some capabilities or capacity are reduced. */
  Limited = 1,
  /** Asking crews to go elsewhere unless there is no alternative. */
  Diversion = 2,
  /** Not taking anyone. */
  Closed = 3,
}

/** A capability the department's POIs can offer (`GET /Mapping/GetPoiCapabilities`). */
export class PoiCapabilityResultData {
  public PoiCapabilityId: string = '';
  public Name: string = '';
  public Sort: number = 0;
}

export interface PoiCapabilitiesResult {
  Data: PoiCapabilityResultData[];
  PageSize?: number;
  Status?: string;
}

/** One destination of `GET /Mapping/GetNearestDestinations`, best first. */
export class NearestDestinationResultData {
  public Poi: PoiResultData | null = null;
  /** Straight-line distance from the origin. */
  public DistanceMeters: number = 0;
  /** Travel seconds from the origin; -1 when not looked up (beyond the shortlist, or the lookup failed). */
  public TravelSeconds: number = -1;
  /** True when it can take the patient now (not closed; the asked capability not reported unavailable). */
  public CanProvide: boolean = true;
}

export interface NearestDestinationsResult {
  Data: NearestDestinationResultData[];
  PageSize?: number;
  Status?: string;
}

/** The department's destination suggestions setting (Core `DestinationSuggestionModes`, setting 127). */
export enum DestinationSuggestionModes {
  Off = 0,
  /** Shows the best destinations beside the destination field. */
  Suggest = 1,
  /** Also fills an empty destination of a new call with the best one. */
  SuggestAndFill = 2,
}

/**
 * One destination rule (`GET /Mapping/GetDestinationRules`), read-only. A null condition matches every call (or unit); a
 * name is null when what the id names was deleted (a rule whose condition was deleted never matches).
 */
export class DestinationRuleResultData {
  public DestinationRuleId: string = '';
  public Name: string = '';
  public CallTypeId: number | null = null;
  public CallTypeName: string | null = null;
  public CallPriority: number | null = null;
  public CallPriorityName: string | null = null;
  public UnitTypeId: number | null = null;
  public UnitTypeName: string | null = null;
  /** Destination POI types it allows; empty allows any destination type. */
  public PoiTypeIds: number[] = [];
  public PoiTypeNames: string[] = [];
  public RequiredCapabilityIds: string[] = [];
  public RequiredCapabilityNames: string[] = [];
  public PreferredCapabilityIds: string[] = [];
  public PreferredCapabilityNames: string[] = [];
  /** How many of the ids name something deleted since (the rule needs fixing on the web). */
  public MissingReferenceCount: number = 0;
}

export class DestinationRulesResultData {
  public Mode: DestinationSuggestionModes = DestinationSuggestionModes.Off;
  /** A destination with more preferred capabilities comes first only within this many minutes of the closest. */
  public PreferredWithinMinutes: number = 3;
  public Rules: DestinationRuleResultData[] = [];
}

export interface DestinationRulesResult {
  Data: DestinationRulesResultData | null;
  PageSize?: number;
  Status?: string;
}

/** `POST /Mapping/SetPoiAvailability` body. */
export interface SetPoiAvailabilityInput {
  PoiId: number;
  /** PoiAvailabilityStatuses; Open clears the report. */
  Status: PoiAvailabilityStatuses;
  UnavailableCapabilityIds: string[];
  Note: string;
  /** Minutes until the report lapses (at most a week); null lasts until changed. */
  ExpiresInMinutes: number | null;
}

export interface SetPoiAvailabilityResult {
  /** The destination after the change. */
  Data: PoiResultData | null;
  PageSize?: number;
  Status?: string;
}

/** A destination rule named in a suggestion: one that applied, or one set aside (Reason `TypeConflict` / `TypesRemoved`). */
export class DestinationRuleRefResultData {
  public DestinationRuleId: string = '';
  public Name: string = '';
  public Reason: string | null = null;
}

/** What the call (and the travelling unit) needs from its destination, from the department's destination rules. */
export class DestinationRequirementsResultData {
  /** Destination POI types allowed; empty allows any destination type. */
  public PoiTypeIds: number[] = [];
  public RequiredCapabilityIds: string[] = [];
  public PreferredCapabilityIds: string[] = [];
  public Rules: DestinationRuleRefResultData[] = [];
  public SetAsideRules: DestinationRuleRefResultData[] = [];
}

/** One destination of `GET /Mapping/GetSuggestedDestinations`, best first. */
export class SuggestedDestinationResultData extends NearestDestinationResultData {
  /** Road distance of the drive; -1 when not routed (DistanceMeters is the straight line). */
  public TravelDistanceMeters: number = -1;
  /** PoiAvailabilityStatuses now. */
  public Status: number = 0;
  /** Offers every required capability (one it reports down still counts; CanProvide is false then). */
  public MeetsRequirements: boolean = true;
  /** Required capability ids it does not offer. */
  public MissingCapabilityIds: string[] = [];
  /** Preferred capability ids it offers. */
  public PreferredCapabilityIds: string[] = [];
  /** 0 ready, 1 on diversion, 2 lacking a required capability, 3 closed. */
  public Tier: number = 0;
}

/**
 * `GET /Mapping/GetSuggestedDestinations` (Core M0317, setting 127): the call's (and unit's) destination requirements and
 * the department's destinations ranked for them. While the department's suggestions are off, `Mode` is 0 and nothing is
 * returned or routed.
 */
export class SuggestedDestinationsResultData {
  public Mode: DestinationSuggestionModes = DestinationSuggestionModes.Off;
  public PreferredWithinMinutes: number = 3;
  /** The best destination that meets the requirements; null when none does (or suggestions are off). */
  public SuggestedPoiId: number | null = null;
  public Requirements: DestinationRequirementsResultData | null = null;
  public Destinations: SuggestedDestinationResultData[] = [];
}

export interface SuggestedDestinationsResult {
  Data: SuggestedDestinationsResultData | null;
  PageSize?: number;
  Status?: string;
}
