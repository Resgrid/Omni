import { UnitAlertList, useUnitAlerts } from '@resgrid/features/unit-status-alerts';
import React from 'react';

import { useStale } from '../../hooks/use-stale';
import { useWidgetTitle } from '../../hooks/use-widget-title';
import { WidgetTypes } from '../../lib/widget-types';
import { WidgetContainer } from '../widget-container';
import type { WidgetProps } from './types';

/**
 * Only the units sitting in a status longer than the department allows (the Units widget highlights them in place; this
 * is the dedicated panel): the shared unit alert list, with the board's stale marker and edit mode.
 */
export const UnitAlertsWidget: React.FC<WidgetProps> = ({ isEditMode, onRemove, onConfigure }) => {
  const title = useWidgetTitle(WidgetTypes.UNIT_ALERTS);
  const { units, hasError } = useUnitAlerts();
  const stale = useStale(units.length > 0, hasError);

  return (
    <WidgetContainer title={title} testID="unit-alerts-widget" isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure} stale={stale}>
      <UnitAlertList isEditMode={isEditMode} />
    </WidgetContainer>
  );
};
