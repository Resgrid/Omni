import type { UnitResponseCodeChoices } from '@resgrid/data';
import type { DispatchResponseCodeData } from '@resgrid/models';

/**
 * Conditional run cards (Dispatch.RunCardConditions) on the recommendation panel: the decision explanation, the row each
 * resource fills, response codes and re-evaluating a pinned decision. Left out (or `enabled` false), the panel shows what
 * a fixed run card shows and nothing more.
 */
export interface RecommendationConditionsProps {
  enabled: boolean;
  /** The department's pickable response codes. Empty hides the per-unit picker; codes the proposal carries still show. */
  responseCodes?: readonly DispatchResponseCodeData[];
  /** The dispatcher's code choices over the proposal (unit id to code id, null for none). */
  unitResponseCodes?: UnitResponseCodeChoices;
  onUnitResponseCodeChange?: (unitId: number, codeId: number | null) => void;
  /** Offered when the decision is pinned (a call already out): walks the decision graph again. */
  onReevaluate?: () => void;
  isReevaluating?: boolean;
}
