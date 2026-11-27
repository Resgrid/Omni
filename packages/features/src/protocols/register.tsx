import { registerCallDetailTab } from '@resgrid/features/calls/detail-tabs/registry';
import { useCallPermissions } from '@resgrid/features/calls/hooks/use-call-permissions';
import type { CallResultData } from '@resgrid/models';
import React from 'react';

import { CallProtocolSteps } from './components/call-protocol-steps';

export const PROTOCOL_STEPS_CALL_DETAIL_TAB_ID = 'protocol-steps';

/** The steps tab body: who may tick steps is the call's edit right (Core checks it again on every write). */
const CallProtocolStepsTab: React.FC<{ call: CallResultData; callId: string }> = ({ call, callId }) => {
  const { canEdit } = useCallPermissions(call);

  return <CallProtocolSteps callId={callId} canEdit={canEdit} />;
};

/** Registers the call detail "Steps" tab (protocol step-through) for apps with `capabilities.protocols.stepThrough`. */
export function registerProtocolStepsCallDetailTab(): () => void {
  return registerCallDetailTab({
    id: PROTOCOL_STEPS_CALL_DETAIL_TAB_ID,
    order: 21,
    title: 'protocols.steps.call_tab',
    visible: (context) => context.capabilities.protocols.stepThrough,
    render: (context) => <CallProtocolStepsTab call={context.call} callId={context.callId} />,
  });
}
