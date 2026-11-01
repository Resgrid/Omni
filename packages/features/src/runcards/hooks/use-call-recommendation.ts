import { useAwaitingResourcesStore, useRunCardsStore } from '@resgrid/data';
import type { DispatchRecommendationResultData } from '@resgrid/models';
import { useCallback, useEffect, useMemo } from 'react';

import type { RecommendationConditionsProps } from '../lib/recommendation-types';
import { applyRecommendationToSelection, type RecommendationSelection } from '../lib/run-cards';
import { useIsRunCardConditionsEnabled, useIsRunCardsEnabled } from './use-run-card-flags';

export interface UseCallRecommendationArgs {
  /** Call priority id; null until the dispatcher picks one. */
  priority: number | null | undefined;
  /** Call type name. */
  type: string | null | undefined;
  latitude?: number | null;
  longitude?: number | null;
  /** 1 for a new call; the next level when previewing an escalation. */
  alarmLevel?: number;
}

export interface CallRecommendationResult {
  isRunCardsEnabled: boolean;
  recommendation: DispatchRecommendationResultData | null;
  isLoading: boolean;
  hasError: boolean;
  hasFetched: boolean;
  isApplied: boolean;
  refresh: () => void;
  applyToSelection: <S extends RecommendationSelection>(current: S) => S;
  /** Pass to the panel's `conditions` prop. */
  conditions: RecommendationConditionsProps;
}

/**
 * Keeps a run card recommendation in step with the call being composed (Dispatch baseline). Fetching is debounced in
 * the store: priority, type and location all change while the dispatcher works. Does nothing at all when run cards are
 * off for the variant or department.
 */
export function useCallRecommendation({ priority, type, latitude, longitude, alarmLevel = 1 }: UseCallRecommendationArgs): CallRecommendationResult {
  const isRunCardsEnabled = useIsRunCardsEnabled();
  const isConditionsEnabled = useIsRunCardConditionsEnabled();
  const recommendation = useRunCardsStore((state) => state.recommendation);
  const isLoading = useRunCardsStore((state) => state.isLoading);
  const hasError = useRunCardsStore((state) => state.error !== null);
  const hasFetched = useRunCardsStore((state) => state.hasFetched);
  const appliedRunCardId = useRunCardsStore((state) => state.appliedRunCardId);
  const unitResponseCodes = useRunCardsStore((state) => state.unitResponseCodes);
  const responseCodes = useAwaitingResourcesStore((state) => state.responseCodes);

  const canRequest = isRunCardsEnabled && typeof priority === 'number' && Number.isFinite(priority) && !!type?.trim();
  const request = useMemo(
    () => ({ priority: typeof priority === 'number' ? priority : null, type: type ?? '', latitude: latitude ?? null, longitude: longitude ?? null, alarmLevel }),
    [priority, type, latitude, longitude, alarmLevel]
  );

  useEffect(() => {
    // Dropping priority or type mid-debounce cancels the pending lookup as well as what is on screen.
    if (!canRequest) {
      useRunCardsStore.getState().clear();
      return;
    }
    useRunCardsStore.getState().fetchRecommendationDebounced(request);
  }, [canRequest, request]);

  // Leaving the form must not strand a recommendation for the next call composed.
  useEffect(() => () => useRunCardsStore.getState().clear(), []);

  useEffect(() => {
    if (isConditionsEnabled) void useAwaitingResourcesStore.getState().fetchResponseCodes();
  }, [isConditionsEnabled]);

  const refresh = useCallback(() => {
    if (canRequest) void useRunCardsStore.getState().fetchRecommendation(request);
  }, [canRequest, request]);

  const applyToSelection = useCallback(
    <S extends RecommendationSelection>(current: S): S => {
      if (!recommendation) return current;
      useRunCardsStore.getState().markApplied(recommendation.MatchedRunCardId ?? null);
      return applyRecommendationToSelection(current, recommendation);
    },
    [recommendation]
  );

  // A New Call preview is always a fresh walk: no re-evaluate here.
  const conditions = useMemo<RecommendationConditionsProps>(
    () => ({ enabled: isConditionsEnabled, responseCodes, unitResponseCodes, onUnitResponseCodeChange: (unitId, codeId) => useRunCardsStore.getState().setUnitResponseCode(unitId, codeId) }),
    [isConditionsEnabled, responseCodes, unitResponseCodes]
  );

  return {
    isRunCardsEnabled,
    recommendation,
    isLoading,
    hasError,
    hasFetched,
    isApplied: !!recommendation?.MatchedRunCardId && appliedRunCardId === recommendation.MatchedRunCardId,
    refresh,
    applyToSelection,
    conditions,
  };
}
