import React from 'react';

import { useAwaitingResourcesSync } from '../hooks/use-awaiting-resources';
import { UnitAvailableAlertHost } from './unit-available-alert-host';

/**
 * Mount once inside the signed-in shell of variants with the `awaiting-resources` module: keeps the list live
 * (`useAwaitingResourcesSync`) and draws the unit-available alerts over every screen. Inert without the flags.
 */
export const AwaitingResourcesHost: React.FC = () => {
  useAwaitingResourcesSync();
  return <UnitAvailableAlertHost />;
};
