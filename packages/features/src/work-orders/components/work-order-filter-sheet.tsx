import { OptionChips } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, CustomBottomSheet, HStack, Text, VStack } from '@resgrid/ui';
import React from 'react';

import { activeWorkOrderFilterCount, WORK_ORDER_PRIORITIES, WORK_ORDER_STATUS_GROUPS, type WorkOrderListFilters, type WorkOrderStatusGroup } from '../lib/work-order-filters';

export interface WorkOrderFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filters: WorkOrderListFilters;
  onChange: (filters: WorkOrderListFilters) => void;
  testID?: string;
}

/** Status (all / open / finished) and priority (any of) for the work order list. View state only. */
export const WorkOrderFilterSheet: React.FC<WorkOrderFilterSheetProps> = ({ isOpen, onClose, filters, onChange, testID = 'work-orders-filter-sheet' }) => {
  const { t } = useTranslation();
  const togglePriority = (priority: number) => onChange({ ...filters, priorities: filters.priorities.includes(priority) ? filters.priorities.filter((value) => value !== priority) : [...filters.priorities, priority] });
  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[50]} testID={testID}>
      <VStack space="md" className="w-full">
        <HStack className="items-center justify-between">
          <Text className="text-lg font-bold text-typography-900">{t('workOrders.filterTitle')}</Text>
          {activeWorkOrderFilterCount(filters) > 0 ? (
            <Button variant="link" size="sm" onPress={() => onChange({ ...filters, status: 'all', priorities: [] })} testID={`${testID}-clear`}>
              <ButtonText>{t('workOrders.clearFilters')}</ButtonText>
            </Button>
          ) : null}
        </HStack>
        <VStack space="xs">
          <Text size="sm" className="font-semibold text-typography-700">
            {t('workOrders.filterStatus')}
          </Text>
          <OptionChips<WorkOrderStatusGroup>
            options={WORK_ORDER_STATUS_GROUPS.map((value) => ({ value, label: t(`workOrders.statusGroup.${value}`) }))}
            selected={[filters.status]}
            onToggle={(status) => onChange({ ...filters, status })}
            accessibilityLabel={t('workOrders.filterStatus')}
            testID={`${testID}-status`}
          />
        </VStack>
        <VStack space="xs">
          <Text size="sm" className="font-semibold text-typography-700">
            {t('workOrders.form.priority')}
          </Text>
          <OptionChips<number>
            mode="multiple"
            options={WORK_ORDER_PRIORITIES.map((value) => ({ value, label: t(`workOrders.priority.${value}`) }))}
            selected={filters.priorities}
            onToggle={togglePriority}
            accessibilityLabel={t('workOrders.form.priority')}
            testID={`${testID}-priority`}
          />
        </VStack>
        <Button onPress={onClose} testID={`${testID}-done`}>
          <ButtonText>{t('common.done')}</ButtonText>
        </Button>
      </VStack>
    </CustomBottomSheet>
  );
};
