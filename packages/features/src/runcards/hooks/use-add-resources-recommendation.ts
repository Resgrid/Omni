import { selectCallRecommendation, type UnitResponseCodeChoices, useAwaitingResourcesStore, useRunCardsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { DispatchRecommendationResultData } from '@resgrid/models';
import { useToast } from '@resgrid/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { RecommendationConditionsProps } from '../lib/recommendation-types';
import { runCardSaveFields } from '../lib/run-card-conditions';
import { applyRecommendationToSelection, type RecommendationSelection } from '../lib/run-cards';
import { useIsRunCardConditionsEnabled, useIsRunCardsEnabled } from './use-run-card-flags';

export interface UseAddResourcesRecommendationArgs {
  /** The active call resources are being added to. */
  callId: string | null | undefined;
  /** Only while the picker is open: every open is a fresh lookup (units clear and get committed all the time). */
  enabled: boolean;
}

export interface AddResourcesRecommendationResult {
  isRunCardsEnabled: boolean;
  recommendation: DispatchRecommendationResultData | null;
  isLoading: boolean;
  hasError: boolean;
  hasFetched: boolean;
  isApplied: boolean;
  refresh: () => void;
  applyToSelection: <S extends RecommendationSelection>(current: S) => S;
  conditions: RecommendationConditionsProps;
  /** UnitResponseCodes for the add-resources save: the recommended units among those being added, with their codes. */
  getUnitResponseCodes: (selectedUnitIds: readonly (string | number)[] | null | undefined) => string | undefined;
}

/**
 * Run card recommendation for adding resources to a call already out (Dispatch baseline). The server counts what the
 * call already has toward the run card, so only what is still missing comes back. A call already out has its decision
 * pinned at save time, so the panel offers Re-evaluate here (unlike New Call).
 */
export function useAddResourcesRecommendation({ callId, enabled }: UseAddResourcesRecommendationArgs): AddResourcesRecommendationResult {
  const { t } = useTranslation();
  const toast = useToast();
  const isRunCardsEnabled = useIsRunCardsEnabled();
  const isConditionsEnabled = useIsRunCardConditionsEnabled();
  const entry = useRunCardsStore((state) => selectCallRecommendation(state, callId));
  const responseCodes = useAwaitingResourcesStore((state) => state.responseCodes);
  const [isApplied, setIsApplied] = useState(false);
  const [unitResponseCodes, setUnitResponseCodes] = useState<UnitResponseCodeChoices>({});

  const canRequest = isRunCardsEnabled && enabled && !!callId;

  const load = useCallback(() => {
    if (!canRequest || !callId) return;
    setIsApplied(false);
    setUnitResponseCodes({});
    void useRunCardsStore.getState().fetchCallRecommendation(callId);
  }, [callId, canRequest]);

  useEffect(() => {
    if (!callId) return undefined;
    if (!canRequest) {
      useRunCardsStore.getState().clearCallRecommendation(callId);
      setIsApplied(false);
      setUnitResponseCodes({});
      return undefined;
    }
    load();
    return () => useRunCardsStore.getState().clearCallRecommendation(callId);
  }, [callId, canRequest, load]);

  useEffect(() => {
    if (isConditionsEnabled && enabled) void useAwaitingResourcesStore.getState().fetchResponseCodes();
  }, [enabled, isConditionsEnabled]);

  const reevaluate = useCallback(() => {
    if (!callId) return;
    void useRunCardsStore
      .getState()
      .fetchCallRecommendation(callId, { reevaluate: true })
      .then((ok) => {
        if (ok) {
          setIsApplied(false);
          setUnitResponseCodes({});
        } else {
          toast.error(t('run_cards.conditions.reevaluate_failed'));
        }
      });
  }, [callId, t, toast]);

  const applyToSelection = useCallback(
    <S extends RecommendationSelection>(current: S): S => {
      if (!entry.recommendation) return current;
      setIsApplied(true);
      return applyRecommendationToSelection(current, entry.recommendation);
    },
    [entry.recommendation]
  );

  const conditions = useMemo<RecommendationConditionsProps>(
    () => ({
      enabled: isConditionsEnabled,
      responseCodes,
      unitResponseCodes,
      onUnitResponseCodeChange: (unitId, codeId) => setUnitResponseCodes((current) => ({ ...current, [unitId]: codeId })),
      onReevaluate: reevaluate,
      isReevaluating: entry.isReevaluating,
    }),
    [entry.isReevaluating, isConditionsEnabled, reevaluate, responseCodes, unitResponseCodes]
  );

  const getUnitResponseCodes = useCallback(
    (selectedUnitIds: readonly (string | number)[] | null | undefined) =>
      runCardSaveFields(entry.recommendation, unitResponseCodes, selectedUnitIds, { conditionsEnabled: isConditionsEnabled, hasResponseCodes: responseCodes.length > 0, includeOutcome: false }).unitResponseCodes,
    [entry.recommendation, isConditionsEnabled, responseCodes.length, unitResponseCodes]
  );

  return {
    isRunCardsEnabled,
    recommendation: entry.recommendation,
    isLoading: entry.isLoading,
    hasError: entry.error !== null,
    hasFetched: entry.hasFetched,
    isApplied,
    refresh: load,
    applyToSelection,
    conditions,
    getUnitResponseCodes,
  };
}
