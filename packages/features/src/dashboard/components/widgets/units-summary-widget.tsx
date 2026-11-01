import { useUnitsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { View } from '@resgrid/ui';
import React, { useMemo } from 'react';

import { useStale } from '../../hooks/use-stale';
import { useWidgetSettings } from '../../hooks/use-widget-settings-store';
import { useWidgetTitle } from '../../hooks/use-widget-title';
import { summarizeUnits } from '../../lib/board-data';
import { WidgetTypes } from '../../lib/widget-types';
import { WidgetContainer, WidgetLoading, WidgetMessage } from '../widget-container';
import { SummaryRow } from './summary-row';
import type { WidgetProps } from './types';

const AVAILABLE_COLOR = '#16a34a';
const RESPONDING_COLOR = '#ca8a04';
const ON_SCENE_COLOR = '#dc2626';

/** Units in total, available, responding and on scene — counted by what each status means. */
export const UnitsSummaryWidget: React.FC<WidgetProps> = ({ isEditMode, onRemove, onConfigure }) => {
  const { t } = useTranslation();
  const title = useWidgetTitle(WidgetTypes.UNITS_SUMMARY);
  const units = useUnitsStore((state) => state.unitInfos);
  const isLoading = useUnitsStore((state) => state.loading.unitInfos === true);
  const hasError = useUnitsStore((state) => !!state.errors.unitInfos);
  const settings = useWidgetSettings('unitsSummary');
  const summary = useMemo(() => summarizeUnits(units), [units]);
  const stale = useStale(units.length > 0, hasError);

  return (
    <WidgetContainer title={title} testID="units-summary-widget" isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure} stale={stale}>
      {isLoading && units.length === 0 ? (
        <WidgetLoading testID="units-summary-widget-loading" />
      ) : hasError && units.length === 0 ? (
        <WidgetMessage message={t('dashboard.failed_to_load')} tone="error" testID="units-summary-widget-error" />
      ) : (
        <View>
          <SummaryRow label={t('dashboard.summary.total')} value={summary.total} fontSize={settings.fontSize} scale={1.6} testID="units-summary-total" />
          {settings.showAvailable ? <SummaryRow label={t('dashboard.summary.available')} value={summary.available} fontSize={settings.fontSize} color={AVAILABLE_COLOR} testID="units-summary-available" /> : null}
          {settings.showResponding ? <SummaryRow label={t('dashboard.summary.responding')} value={summary.responding} fontSize={settings.fontSize} color={RESPONDING_COLOR} testID="units-summary-responding" /> : null}
          {settings.showOnScene ? <SummaryRow label={t('dashboard.summary.on_scene')} value={summary.onScene} fontSize={settings.fontSize} color={ON_SCENE_COLOR} testID="units-summary-on-scene" /> : null}
        </View>
      )}
    </WidgetContainer>
  );
};
