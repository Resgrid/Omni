import { FeatureFlagKeys } from '@resgrid/auth';
import { registerCallDetailTab, registerCallFormHookPoints } from '@resgrid/features/calls';
import React from 'react';

import { AddResourcesRecommendation } from './components/add-resources-recommendation';
import { RunCardCallSection } from './components/run-card-call-section';
import { RunCardRecommendation } from './components/run-card-recommendation';

export const RUN_CARD_CALL_DETAIL_TAB_ID = 'run-card';

/**
 * Plugs run cards into the call create form and "Dispatch more" (the `RunCardRecommendation` and
 * `AddResourcesRecommendation` hook points). Call once at app start; both still show only with
 * `capabilities.calls.runCards` + Dispatch.RunCards. Returns a function that removes the registration again.
 */
export function registerRunCardHookPoints(): () => void {
  return registerCallFormHookPoints({ RunCardRecommendation, AddResourcesRecommendation });
}

/**
 * The call detail "Run card" tab (alarm level + Strike Next Alarm), visible only when a run card drives the call, the
 * variant ships run cards and the department has Dispatch.RunCards on.
 */
export function registerRunCardCallDetailTab(): () => void {
  return registerCallDetailTab({
    id: RUN_CARD_CALL_DETAIL_TAB_ID,
    order: 25,
    title: 'run_cards.call_tab',
    visible: (context) => context.capabilities.calls.runCards && context.isFeatureEnabled(FeatureFlagKeys.DispatchRunCards) && !!context.call.ActiveRunCardId,
    render: (context) => <RunCardCallSection call={context.call} canEdit={context.security.canUserCreateCalls} onEscalated={() => void context.refresh()} />,
  });
}
