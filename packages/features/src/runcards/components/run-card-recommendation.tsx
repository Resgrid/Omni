import { useAwaitingResourcesStore, useRunCardsStore } from '@resgrid/data';
import type { RunCardRecommendationProps } from '@resgrid/features/calls';
import React, { useCallback, useEffect, useRef } from 'react';

import { useCallRecommendation } from '../hooks/use-call-recommendation';
import { runCardSaveFields } from '../lib/run-card-conditions';
import { RecommendationPanel } from './recommendation-panel';

/**
 * The run card recommendation in the call create form — the `RunCardRecommendation` call-form hook point
 * (`registerRunCardHookPoints`). It previews what the department's run cards would send for the call being composed;
 * "Apply" merges that into the form's dispatch selection and hands the form the decision it reviewed (outcome node and
 * per-unit response codes) to post with the save. The form shows it only with `capabilities.calls.runCards` and the
 * Dispatch.RunCards flag.
 */
export const RunCardRecommendation: React.FC<RunCardRecommendationProps> = ({ call, selection, onApply }) => {
  const { recommendation, isLoading, hasError, hasFetched, isApplied, refresh, applyToSelection, conditions } = useCallRecommendation({
    priority: call.priority,
    type: call.type,
    latitude: call.latitude ?? null,
    longitude: call.longitude ?? null,
  });
  const unitResponseCodes = useRunCardsStore((state) => state.unitResponseCodes);
  const hasResponseCodes = useAwaitingResourcesStore((state) => state.responseCodes.length > 0);
  const lastSent = useRef<string | null>(null);

  const decisionFor = useCallback(
    (units: readonly string[]) => {
      const fields = runCardSaveFields(recommendation, unitResponseCodes, units, { conditionsEnabled: conditions.enabled, hasResponseCodes, includeOutcome: true });
      return { outcomeNodeKey: fields.outcomeNodeKey, unitResponseCodes: fields.unitResponseCodes };
    },
    [conditions.enabled, hasResponseCodes, recommendation, unitResponseCodes]
  );

  const handleApply = useCallback(() => {
    const next = applyToSelection(selection);
    const decision = decisionFor(next.units);
    lastSent.current = `${decision.outcomeNodeKey ?? ''}|${decision.unitResponseCodes ?? ''}`;
    onApply(next, decision);
  }, [applyToSelection, decisionFor, onApply, selection]);

  // The decision the dispatcher reviewed reaches the save whether or not they pressed Apply (Dispatch baseline
  // `newCallRunCardSaveFields`): a hand-picked dispatch still records the outcome on screen, and codes picked (or units
  // removed) later still go. The selection is handed back unchanged; only Apply merges the proposal into it.
  useEffect(() => {
    const decision = decisionFor(selection.units);
    const key = `${decision.outcomeNodeKey ?? ''}|${decision.unitResponseCodes ?? ''}`;

    if (key === (lastSent.current ?? '|')) return;
    lastSent.current = key;
    onApply(selection, decision);
  }, [decisionFor, onApply, selection]);

  return (
    <RecommendationPanel
      recommendation={recommendation}
      isLoading={isLoading}
      hasError={hasError}
      hasFetched={hasFetched}
      isApplied={isApplied}
      onApply={handleApply}
      onRefresh={refresh}
      conditions={conditions}
      testID="run-card-recommendation-panel"
    />
  );
};
