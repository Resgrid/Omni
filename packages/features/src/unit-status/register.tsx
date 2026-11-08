import { registerCallFormHookPoints } from '@resgrid/features/calls';

import { SetActiveCallButton } from './components/set-active-call-button';

/**
 * Puts "Set Active" beside the title of a call's detail screen (the `CallDetailAction` hook point). Call once at app
 * start; the button shows only where the device reports status for a unit (Unit). Returns a function that removes the
 * registration again.
 */
export function registerUnitStatusCallDetailAction(): () => void {
  return registerCallFormHookPoints({ CallDetailAction: SetActiveCallButton });
}
