import { usePersonnelStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { PersonnelInfoResultData } from '@resgrid/models';
import { HStack, TypeIcon } from '@resgrid/ui';
import React, { useMemo } from 'react';

import { useNow } from '../../hooks/use-now';
import { useStale } from '../../hooks/use-stale';
import { useWidgetSettings } from '../../hooks/use-widget-settings-store';
import { useWidgetTitle } from '../../hooks/use-widget-title';
import { selectPersonnelRows } from '../../lib/board-data';
import { PERSONNEL_COLUMN_LABEL_KEYS } from '../../lib/column-labels';
import { ELAPSED_KEYS, elapsedSinceLocal, normalizeColor } from '../../lib/format';
import type { PersonnelColumnKey } from '../../lib/widget-settings';
import { WidgetTypes } from '../../lib/widget-types';
import { WidgetContainer, WidgetLoading, WidgetMessage } from '../widget-container';
import { CellText, type TableColumn, WidgetTable } from '../widget-table';
import type { WidgetProps } from './types';

const COLUMN_FLEX: Readonly<Record<PersonnelColumnKey, number>> = { name: 1, group: 0.8, staffing: 0.7, status: 0.7, roles: 0.8, timestamp: 0.9 };

/** The department roster as a table: status and staffing in the department's colours, filtered and sorted by meaning. */
export const PersonnelWidget: React.FC<WidgetProps> = ({ isEditMode, onRemove, onConfigure }) => {
  const { t } = useTranslation();
  const title = useWidgetTitle(WidgetTypes.PERSONNEL);
  const personnel = usePersonnelStore((state) => state.personnel);
  const isLoading = usePersonnelStore((state) => state.loading.personnel === true);
  const hasError = usePersonnelStore((state) => !!state.errors.personnel);
  const settings = useWidgetSettings('personnel');
  const now = useNow(60000, settings.showTimestamp);
  const stale = useStale(personnel.length > 0, hasError);
  const rows = useMemo(() => selectPersonnelRows(personnel, settings), [personnel, settings]);
  const { fontSize } = settings;

  const columns = useMemo<TableColumn<PersonnelInfoResultData>[]>(() => {
    const visible: Record<PersonnelColumnKey, boolean> = {
      name: true,
      group: settings.showGroup,
      staffing: settings.showStaffing,
      status: settings.showStatus,
      roles: settings.showRoles,
      timestamp: settings.showTimestamp,
    };
    const render: Record<PersonnelColumnKey, (person: PersonnelInfoResultData) => React.ReactNode> = {
      name: (person) => (
        <HStack space="xs" className="items-center">
          <TypeIcon iconUrl={person.RoleIconUrl ?? null} size={fontSize + 4} testID={`personnel-role-icon-${person.UserId}`} />
          <CellText fontSize={fontSize} bold>
            {`${person.FirstName ?? ''} ${person.LastName ?? ''}`.trim()}
          </CellText>
        </HStack>
      ),
      group: (person) => (
        <CellText fontSize={fontSize} muted>
          {person.GroupName}
        </CellText>
      ),
      staffing: (person) => (
        <CellText fontSize={fontSize} color={normalizeColor(person.StaffingColor)}>
          {person.Staffing || t('common.unknown')}
        </CellText>
      ),
      status: (person) => (
        <CellText fontSize={fontSize} color={normalizeColor(person.StatusColor)}>
          {person.Status || t('common.unknown')}
        </CellText>
      ),
      roles: (person) => (
        <CellText fontSize={Math.max(8, fontSize - 2)} muted>
          {(person.Roles ?? []).join(', ')}
        </CellText>
      ),
      timestamp: (person) => {
        const elapsed = elapsedSinceLocal(person.StatusTimestamp, now);
        return (
          <CellText fontSize={fontSize} muted>
            {elapsed ? t(ELAPSED_KEYS[elapsed.unit], { count: elapsed.count }) : ''}
          </CellText>
        );
      },
    };
    return settings.columnOrder.filter((key) => visible[key]).map((key) => ({ key, label: t(PERSONNEL_COLUMN_LABEL_KEYS[key]), flex: COLUMN_FLEX[key], render: render[key] }));
  }, [fontSize, now, settings, t]);

  return (
    <WidgetContainer title={title} testID="personnel-widget" isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure} stale={stale}>
      {isLoading && personnel.length === 0 ? (
        <WidgetLoading testID="personnel-widget-loading" />
      ) : hasError && personnel.length === 0 ? (
        <WidgetMessage message={t('dashboard.failed_to_load')} tone="error" testID="personnel-widget-error" />
      ) : (
        <WidgetTable columns={columns} rows={rows} rowKey={(person) => person.UserId} fontSize={fontSize} emptyMessage={t('dashboard.no_personnel')} testID="personnel-table" />
      )}
    </WidgetContainer>
  );
};
