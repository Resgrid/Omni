import { FeatureFlagKeys } from '@resgrid/auth';
import { registerCallDetailTab } from '@resgrid/features/calls';
import React from 'react';
import { ScrollView } from 'react-native';

import { CallOutstandingRequirements } from './components/call-outstanding-requirements';

export const OUTSTANDING_REQUIREMENTS_TAB_ID = 'outstanding-requirements';

/**
 * The call detail "Awaiting" tab: the call's open outstanding requirements with Dismiss (conditional run cards). Visible
 * with `capabilities.calls.runCards` + Dispatch.RunCards + Dispatch.RunCardConditions on an open call; the section itself
 * renders nothing when the call awaits nothing.
 */
export function registerAwaitingResourcesCallDetailTab(): () => void {
  return registerCallDetailTab({
    id: OUTSTANDING_REQUIREMENTS_TAB_ID,
    order: 35,
    title: 'awaiting_resources.call_tab',
    visible: (context) =>
      context.capabilities.calls.runCards && context.isFeatureEnabled(FeatureFlagKeys.DispatchRunCards) && context.isFeatureEnabled(FeatureFlagKeys.DispatchRunCardConditions) && context.call.State === 0,
    render: (context) => (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <CallOutstandingRequirements callId={context.callId} canDismiss={context.security.canUserCreateCalls} />
      </ScrollView>
    ),
  });
}
