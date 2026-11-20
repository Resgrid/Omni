import { type CallDetailActionProps, registerCallFormHookPoints } from '@resgrid/features/calls';
import React from 'react';

import { CallRouteDetailAction } from './components/call-route-actions';
import { SetActiveCallButton } from './components/set-active-call-button';

/** The Unit's actions beside a call's title: "Set Active" for another open call, the call's route for the active call. */
export const UnitCallDetailActions: React.FC<CallDetailActionProps> = ({ call }) => (
  <>
    <SetActiveCallButton call={call} />
    <CallRouteDetailAction call={call} />
  </>
);

/**
 * Puts "Set Active" — and, for the crew's active call with a pre-defined route, "Start route" / "Continue route" with its
 * progress and preview — beside the title of a call's detail screen (the `CallDetailAction` hook point). Call once at app
 * start; the actions show only where the device reports status for a unit (Unit). Returns a function that removes the
 * registration again.
 */
export function registerUnitStatusCallDetailAction(): () => void {
  return registerCallFormHookPoints({ CallDetailAction: UnitCallDetailActions });
}
