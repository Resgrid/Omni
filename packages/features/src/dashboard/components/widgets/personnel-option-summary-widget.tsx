import { usePersonnelStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { ScrollView } from '@resgrid/ui';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { useStale } from '../../hooks/use-stale';
import { useWidgetSettings } from '../../hooks/use-widget-settings-store';
import { useWidgetTitle } from '../../hooks/use-widget-title';
import { countByOption } from '../../lib/board-data';
import { normalizeColor } from '../../lib/format';
import { WidgetTypes } from '../../lib/widget-types';
import { WidgetContainer, WidgetLoading, WidgetMessage } from '../widget-container';
import { SummaryRow } from './summary-row';
import type { WidgetProps } from './types';

interface OptionSummaryProps extends WidgetProps {
  kind: 'status' | 'staffing';
}

/** How many people are in each of the department's personnel statuses (or staffing levels), in the department's colours. */
const PersonnelOptionSummaryWidget: React.FC<OptionSummaryProps> = ({ kind, isEditMode, onRemove, onConfigure }) => {
  const { t } = useTranslation();
  const type = kind === 'status' ? WidgetTypes.PERSONNEL_STATUS_SUMMARY : WidgetTypes.PERSONNEL_STAFFING_SUMMARY;
  const title = useWidgetTitle(type);
  const testID = kind === 'status' ? 'personnel-status-summary-widget' : 'personnel-staffing-summary-widget';
  const personnel = usePersonnelStore((state) => state.personnel);
  const options = usePersonnelStore((state) => (kind === 'status' ? state.statusOptions : state.staffingOptions));
  const optionsSlice = kind === 'status' ? 'statusOptions' : 'staffingOptions';
  const isLoading = usePersonnelStore((state) => state.loading.personnel === true || state.loading[optionsSlice] === true);
  const hasError = usePersonnelStore((state) => !!state.errors.personnel || !!state.errors[optionsSlice]);
  const settings = useWidgetSettings(kind === 'status' ? 'personnelStatusSummary' : 'personnelStaffingSummary');
  const counts = useMemo(() => countByOption(personnel, options, kind), [kind, options, personnel]);
  const stale = useStale(options.length > 0, hasError);

  return (
    <WidgetContainer title={title} testID={testID} isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure} stale={stale}>
      {isLoading && options.length === 0 ? (
        <WidgetLoading testID={`${testID}-loading`} />
      ) : hasError && options.length === 0 ? (
        <WidgetMessage message={t('dashboard.failed_to_load')} tone="error" testID={`${testID}-error`} />
      ) : counts.length === 0 ? (
        <WidgetMessage message={t(kind === 'status' ? 'dashboard.no_statuses' : 'dashboard.no_staffing_levels')} testID={`${testID}-empty`} />
      ) : (
        <ScrollView style={styles.fill} nestedScrollEnabled>
          {counts.map(({ option, count }) => (
            <SummaryRow
              key={String(option.Id)}
              label={option.Text}
              value={count}
              fontSize={settings.fontSize}
              color={settings.showColors && option.BColor ? normalizeColor(option.BColor) : undefined}
              testID={`${testID}-row-${option.Id}`}
            />
          ))}
        </ScrollView>
      )}
    </WidgetContainer>
  );
};

export const PersonnelStatusSummaryWidget: React.FC<WidgetProps> = (props) => <PersonnelOptionSummaryWidget {...props} kind="status" />;

export const PersonnelStaffingSummaryWidget: React.FC<WidgetProps> = (props) => <PersonnelOptionSummaryWidget {...props} kind="staffing" />;

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
