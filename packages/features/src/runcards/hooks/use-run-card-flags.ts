import { FeatureFlagKeys, isFeatureEnabled, useFeatureFlag } from '@resgrid/auth';
import { getCapability, useCapability } from '@resgrid/config';

/**
 * The single gate for run cards on every surface: the variant ships them (`capabilities.calls.runCards`) and the
 * department has `Dispatch.RunCards` on (unknown flags are disabled). Off means no request, no state, no UI — a 404 from
 * a department that simply does not use run cards must never surface as an error.
 */
export function useIsRunCardsEnabled(): boolean {
  const calls = useCapability('calls');
  const flag = useFeatureFlag(FeatureFlagKeys.DispatchRunCards);
  return calls.runCards && flag;
}

/** Conditional run cards (decision explanation, response codes, awaiting resources) depend on Dispatch.RunCards too. */
export function useIsRunCardConditionsEnabled(): boolean {
  const runCards = useIsRunCardsEnabled();
  const conditions = useFeatureFlag(FeatureFlagKeys.DispatchRunCardConditions);
  return runCards && conditions;
}

/** Non-reactive reads for registrations and handlers. */
export const isRunCardsEnabled = (): boolean => getCapability('calls').runCards && isFeatureEnabled(FeatureFlagKeys.DispatchRunCards);

export const isRunCardConditionsEnabled = (): boolean => isRunCardsEnabled() && isFeatureEnabled(FeatureFlagKeys.DispatchRunCardConditions);
