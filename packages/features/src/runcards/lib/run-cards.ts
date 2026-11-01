import { readableTextColor } from '@resgrid/features/status';
import {
  DispatchRecommendationMode,
  type DispatchRecommendationResultData,
  type PersonnelRecommendationData,
  RecommendationSelectionReason,
  RequirementShortfallReason,
  type UnitRecommendationData,
} from '@resgrid/models';

/**
 * Presentation helpers for run card recommendations (Dispatch baseline `lib/run-cards`). Kept out of the components so
 * the label mapping and the "is this worth showing" rules are unit testable and the New Call, add-resources and call
 * detail surfaces cannot drift apart on them.
 */

const SELECTION_REASON_KEYS: Record<number, string> = {
  [RecommendationSelectionReason.InGeofence]: 'run_cards.reason.in_geofence',
  [RecommendationSelectionReason.CascadeStation]: 'run_cards.reason.cascade_station',
  [RecommendationSelectionReason.ClosestByDistance]: 'run_cards.reason.closest_by_distance',
  [RecommendationSelectionReason.ClosestByEta]: 'run_cards.reason.closest_by_eta',
  [RecommendationSelectionReason.RestPeriodOverridden]: 'run_cards.reason.rest_period_overridden',
  [RecommendationSelectionReason.RelaxedFill]: 'run_cards.reason.relaxed_fill',
  [RecommendationSelectionReason.SubstitutePackage]: 'run_cards.reason.substitute_package',
  [RecommendationSelectionReason.FirstArriving]: 'run_cards.reason.first_arriving',
};

/** Translation key for why the engine picked a resource. */
export const selectionReasonKey = (reason: RecommendationSelectionReason): string => SELECTION_REASON_KEYS[reason] ?? 'run_cards.reason.unknown';

const SHORTFALL_REASON_KEYS: Record<number, string> = {
  [RequirementShortfallReason.NoCandidatesAvailable]: 'run_cards.shortfall.no_candidates',
  [RequirementShortfallReason.OutsideRadius]: 'run_cards.shortfall.outside_radius',
  [RequirementShortfallReason.LocationsTooStale]: 'run_cards.shortfall.locations_stale',
  [RequirementShortfallReason.NoLocationData]: 'run_cards.shortfall.no_location_data',
  [RequirementShortfallReason.UnitsNotStaffed]: 'run_cards.shortfall.not_staffed',
  [RequirementShortfallReason.AllInRestPeriod]: 'run_cards.shortfall.all_in_rest_period',
  [RequirementShortfallReason.StationsExhausted]: 'run_cards.shortfall.stations_exhausted',
  [RequirementShortfallReason.NoUnitMatchingStatusFilter]: 'run_cards.shortfall.no_unit_matching_status_filter',
};

/** Translation key explaining why a requirement could not be filled. */
export const shortfallReasonKey = (reason: RequirementShortfallReason): string => SHORTFALL_REASON_KEYS[reason] ?? 'run_cards.shortfall.unknown';

/** Translation key for the mode the engine resolved to. */
export const dispatchModeKey = (mode: DispatchRecommendationMode): string =>
  mode === DispatchRecommendationMode.StationBased ? 'run_cards.mode.station_based' : mode === DispatchRecommendationMode.ClosestUnit ? 'run_cards.mode.closest_unit' : 'run_cards.mode.manual_only';

/** Metres below 1 km, kilometres to one decimal above. Null when the engine had no distance. */
export const formatDistance = (meters: number | null | undefined): string | null => {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) return null;
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
};

/** Rounded-up minutes, or seconds under a minute. Null when no routed ETA was computed. */
export const formatEta = (seconds: number | null | undefined): string | null => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
  return seconds < 60 ? `${Math.round(seconds)}s` : `${Math.ceil(seconds / 60)} min`;
};

/**
 * True when the recommendation is worth putting on screen: a card matched and it selected something, could not fill
 * something, wants a move-up, or (conditional run cards) carries advice for the dispatcher.
 */
export const hasRecommendationContent = (recommendation: DispatchRecommendationResultData | null | undefined): boolean => {
  if (!recommendation || !recommendation.MatchedRunCardId) return false;
  return (
    (recommendation.Units?.length ?? 0) > 0 ||
    (recommendation.Personnel?.length ?? 0) > 0 ||
    (recommendation.Shortfalls?.length ?? 0) > 0 ||
    (recommendation.MoveUps?.length ?? 0) > 0 ||
    !!recommendation.Decision?.AdviceText?.trim()
  );
};

/** Unit ids the recommendation selected, as the strings the dispatch selection uses. */
export const recommendedUnitIds = (recommendation: DispatchRecommendationResultData | null | undefined): string[] => (recommendation?.Units ?? []).map((unit) => String(unit.UnitId));

/** User ids the recommendation selected. */
export const recommendedUserIds = (recommendation: DispatchRecommendationResultData | null | undefined): string[] => (recommendation?.Personnel ?? []).filter((person) => !!person.UserId).map((person) => person.UserId);

/** A dispatch selection shape (structurally the calls feature's `DispatchSelection`). */
export interface RecommendationSelection {
  everyone: boolean;
  users: string[];
  groups: string[];
  roles: string[];
  units: string[];
}

/**
 * Merges a recommendation into a dispatch selection. Additive on purpose: anyone already picked stays picked and
 * applying twice is idempotent. Clears `everyone`, which is mutually exclusive with an explicit selection.
 */
export const applyRecommendationToSelection = <S extends RecommendationSelection>(current: S, recommendation: DispatchRecommendationResultData | null | undefined): S =>
  recommendation
    ? {
        ...current,
        everyone: false,
        units: Array.from(new Set([...current.units, ...recommendedUnitIds(recommendation)])),
        users: Array.from(new Set([...current.users, ...recommendedUserIds(recommendation)])),
      }
    : current;

/** Secondary line for a unit row: station, distance and ETA, whichever the engine knew (status is its own badge). */
export const unitDetailParts = (unit: UnitRecommendationData): string[] => [unit.StationGroupName || null, formatDistance(unit.DistanceMeters), formatEta(unit.EtaSeconds)].filter((part): part is string => !!part);

/** Secondary line for a personnel row. */
export const personnelDetailParts = (person: PersonnelRecommendationData): string[] =>
  [person.RoleName || null, person.StationGroupName || null, formatDistance(person.DistanceMeters), formatEta(person.EtaSeconds), person.CurrentStatusText || null].filter((part): part is string => !!part);

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const normalizeHex = (hex: string): string => {
  const digits = hex.slice(1).toLowerCase();
  return digits.length === 3 ? digits.replace(/./g, (digit) => digit + digit) : digits;
};

/**
 * The unit's status colours as the department set them up. The text colour falls back to black or white by contrast
 * when the status has none or it equals the background. Null when the status has no (opaque hex) colour.
 */
export const unitStatusColors = (unit: Pick<UnitRecommendationData, 'CurrentStatusColor' | 'CurrentStatusTextColor'>): { backgroundColor: string; color: string } | null => {
  const backgroundColor = unit.CurrentStatusColor?.trim();
  if (!backgroundColor || !HEX_COLOR.test(backgroundColor)) return null;
  const textColor = unit.CurrentStatusTextColor?.trim();
  return {
    backgroundColor,
    color: textColor && HEX_COLOR.test(textColor) && normalizeHex(textColor) !== normalizeHex(backgroundColor) ? textColor : (readableTextColor(backgroundColor) ?? '#000000'),
  };
};
