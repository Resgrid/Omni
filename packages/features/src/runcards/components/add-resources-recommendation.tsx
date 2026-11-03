import type { AddResourcesRecommendationProps } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import React, { useCallback, useEffect, useRef } from 'react';

import { useAddResourcesRecommendation } from '../hooks/use-add-resources-recommendation';
import { RecommendationPanel } from './recommendation-panel';

/**
 * The run card recommendation in "Dispatch more" — the `AddResourcesRecommendation` calls hook point
 * (`registerRunCardHookPoints`). The server counts what the call already has toward the run card, so only what is still
 * missing comes back; "Apply" merges it into the pick and hands over the response codes to post with it. Renders nothing
 * without `capabilities.calls.runCards` and the Dispatch.RunCards flag.
 */
export const AddResourcesRecommendation: React.FC<AddResourcesRecommendationProps> = ({ callId, selection, onApply }) => {
  const { t } = useTranslation();
  const recommendation = useAddResourcesRecommendation({ callId, enabled: true });
  const { getUnitResponseCodes, applyToSelection, isApplied } = recommendation;
  const lastSent = useRef<string | null>(null);

  const handleApply = useCallback(() => {
    const next = applyToSelection(selection);
    const unitResponseCodes = getUnitResponseCodes(next.units);

    lastSent.current = unitResponseCodes ?? '';
    onApply(next, { unitResponseCodes });
  }, [applyToSelection, getUnitResponseCodes, onApply, selection]);

  // Codes picked (or units removed) after applying still reach the save: re-send them when they change.
  useEffect(() => {
    if (!isApplied) {
      lastSent.current = null;

      return;
    }

    const unitResponseCodes = getUnitResponseCodes(selection.units);

    if (lastSent.current !== null && (unitResponseCodes ?? '') !== lastSent.current) {
      lastSent.current = unitResponseCodes ?? '';
      onApply(selection, { unitResponseCodes });
    }
  }, [getUnitResponseCodes, isApplied, onApply, selection]);

  if (!recommendation.isRunCardsEnabled) return null;

  return (
    <RecommendationPanel
      recommendation={recommendation.recommendation}
      isLoading={recommendation.isLoading}
      hasError={recommendation.hasError}
      hasFetched={recommendation.hasFetched}
      isApplied={isApplied}
      onApply={handleApply}
      onRefresh={recommendation.refresh}
      coveredMessage={t('run_cards.covered_on_call', { level: recommendation.recommendation?.AlarmLevel ?? 1 })}
      isExistingCall
      conditions={recommendation.conditions}
      testID="add-resources-recommendation"
    />
  );
};
