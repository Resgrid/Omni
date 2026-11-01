import { useTranslation } from '@resgrid/i18n';
import { WorkOrderPriority, type WorkOrderSummary } from '@resgrid/models';
import { Badge, BadgeText, HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { AlertTriangle, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { formatDueDate, isOpenStatus } from '../lib/work-order-rules';

export interface WorkOrderRowProps {
  order: WorkOrderSummary;
  onPress: (order: WorkOrderSummary) => void;
}

/** One work order in the list: title, status, number, priority (high and emergency flagged) and due date. */
export const WorkOrderRow: React.FC<WorkOrderRowProps> = React.memo(({ order, onPress }) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const urgent = order.Priority >= WorkOrderPriority.High;
  const due = formatDueDate(order.DueOn, i18n.language);
  return (
    <Pressable
      onPress={() => onPress(order)}
      accessibilityRole="button"
      accessibilityLabel={[order.Number, order.Title, t(`workOrders.status.${order.Status}`), t(`workOrders.priority.${order.Priority}`)].join(', ')}
      testID={`work-order-${order.Id}`}
      className="mb-2 rounded-lg border border-outline-200 bg-background-0 p-3"
    >
      <HStack className="items-center" space="sm">
        <VStack className="flex-1" space="xs">
          <HStack className="items-center justify-between" space="sm">
            <Text className="flex-1 font-semibold text-typography-900" numberOfLines={2}>
              {order.Title}
            </Text>
            <Badge action={isOpenStatus(order.Status) ? 'info' : 'muted'} size="sm">
              <BadgeText>{t(`workOrders.status.${order.Status}`)}</BadgeText>
            </Badge>
          </HStack>
          <HStack className="items-center" space="xs">
            {urgent ? (
              <View testID={`work-order-urgent-${order.Id}`}>
                <AlertTriangle size={14} color={order.Priority >= WorkOrderPriority.Emergency ? colors.error : colors.warning} />
              </View>
            ) : null}
            <Text size="sm" className="text-typography-500">
              {[order.Number, t(`workOrders.priority.${order.Priority}`), due ? t('workOrders.due', { date: due }) : ''].filter((part) => !!part).join(' · ')}
            </Text>
          </HStack>
        </VStack>
        <View>
          <ChevronRight size={18} color={colors.icon} />
        </View>
      </HStack>
    </Pressable>
  );
});

WorkOrderRow.displayName = 'WorkOrderRow';
