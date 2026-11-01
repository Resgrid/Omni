import { useCallsStore } from '@resgrid/data';
import { resolvePriority } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { FlatList, HStack, Pressable, RefreshControl, Text, TypeIcon, useFormFactor, VStack } from '@resgrid/ui';
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

export interface QueueColumn {
  key: string;
  titleKey: string;
  /** Relative width on wide screens. */
  flex: number;
  render: (call: CallResultData) => React.ReactNode;
}

export interface QueueTableProps {
  calls: readonly CallResultData[];
  /** Columns after the always-present number and name columns. */
  columns: readonly QueueColumn[];
  onOpenCall: (call: CallResultData) => void;
  renderActions?: (call: CallResultData) => React.ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
  testID: string;
  /** Row testID prefix, e.g. `pending-call-row`. */
  rowTestID: string;
}

/** The call's priority as a coloured dot and its (department or built-in) name. */
export const PriorityCell: React.FC<{ priorityId: number }> = ({ priorityId }) => {
  const { t } = useTranslation();
  const priorities = useCallsStore((state) => state.callPriorities);
  const priority = resolvePriority(priorities, priorityId);
  const label = priority ? (priority.isLabelKey ? t(priority.label) : priority.label) : '-';
  return (
    <HStack space="xs" className="items-center">
      <View style={StyleSheet.flatten([styles.dot, { backgroundColor: priority?.color || '#6b7280' }])} />
      <Text className="flex-1 text-sm text-typography-600" numberOfLines={1}>
        {label}
      </Text>
    </HStack>
  );
};

/** The call type with its icon. */
export const TypeCell: React.FC<{ call: CallResultData }> = ({ call }) => (
  <HStack space="xs" className="items-center">
    <TypeIcon iconUrl={call.TypeIconUrl ?? null} mapIcon={call.TypeMapIcon ?? null} size={16} />
    <Text className="flex-1 text-sm text-typography-600" numberOfLines={1}>
      {call.Type || '-'}
    </Text>
  </HStack>
);

export const TextCell: React.FC<{ value: string | null | undefined; tone?: 'default' | 'accent' }> = ({ value, tone = 'default' }) => (
  <Text className={tone === 'accent' ? 'text-sm font-medium text-primary-600' : 'text-sm text-typography-600'} numberOfLines={1}>
    {value || '-'}
  </Text>
);

/**
 * The queue screens' list (Dispatch baseline tables): a striped table on tablets and desktop consoles — number, name,
 * then the screen's columns and actions — and stacked cards on phones. Rows open the call; actions inside a row never
 * also open it.
 */
export const QueueTable: React.FC<QueueTableProps> = ({ calls, columns, onOpenCall, renderActions, refreshing, onRefresh, testID, rowTestID }) => {
  const { t } = useTranslation();
  const { isPhone } = useFormFactor();

  const renderRow = useCallback(
    ({ item, index }: { item: CallResultData; index: number }) => {
      const actions = renderActions ? renderActions(item) : null;
      if (isPhone) {
        return (
          <Pressable onPress={() => onOpenCall(item)} className="mb-2 rounded-xl border border-outline-200 bg-background-0 p-3" testID={`${rowTestID}-${item.CallId}`}>
            <Text className="font-bold" numberOfLines={1}>
              {`${item.Number || item.CallId} · ${item.Name}`}
            </Text>
            <VStack space="xs" className="mt-1">
              {columns.map((column) => (
                <HStack key={column.key} space="sm" className="items-center">
                  <Text className="w-24 text-xs uppercase text-typography-500">{t(column.titleKey)}</Text>
                  <View className="flex-1">{column.render(item)}</View>
                </HStack>
              ))}
            </VStack>
            {actions ? <HStack className="mt-2 flex-wrap justify-end">{actions}</HStack> : null}
          </Pressable>
        );
      }
      return (
        <Pressable
          onPress={() => onOpenCall(item)}
          className={`flex-row items-center border-b border-outline-100 px-3 py-3 ${index % 2 === 0 ? 'bg-background-0' : 'bg-background-50'}`}
          testID={`${rowTestID}-${item.CallId}`}
        >
          <View style={styles.numberCell}>
            <Text className="text-sm font-bold" numberOfLines={1}>
              {item.Number || item.CallId}
            </Text>
          </View>
          <View style={styles.nameCell}>
            <Text className="text-sm font-medium" numberOfLines={1}>
              {item.Name}
            </Text>
          </View>
          {columns.map((column) => (
            <View key={column.key} style={StyleSheet.flatten([styles.cell, { flex: column.flex }])}>
              {column.render(item)}
            </View>
          ))}
          {renderActions ? <HStack style={styles.actionsCell}>{actions}</HStack> : null}
        </Pressable>
      );
    },
    [columns, isPhone, onOpenCall, renderActions, rowTestID, t]
  );

  return (
    <View className="flex-1 overflow-hidden rounded-lg border border-outline-200" testID={testID}>
      {isPhone ? null : (
        <View className="flex-row items-center border-b-2 border-outline-200 bg-background-50 px-3 py-2.5">
          <Text style={styles.numberCell} className="text-xs font-bold uppercase text-typography-500">
            {t('scheduled_calls.table_number')}
          </Text>
          <Text style={styles.nameCell} className="text-xs font-bold uppercase text-typography-500">
            {t('scheduled_calls.table_name')}
          </Text>
          {columns.map((column) => (
            <Text key={column.key} style={StyleSheet.flatten([styles.cell, { flex: column.flex }])} className="text-xs font-bold uppercase text-typography-500" numberOfLines={1}>
              {t(column.titleKey)}
            </Text>
          ))}
          {renderActions ? (
            <Text style={styles.actionsCell} className="text-xs font-bold uppercase text-typography-500">
              {t('call_queues.actions')}
            </Text>
          ) : null}
        </View>
      )}
      <FlatList
        testID={`${testID}-list`}
        data={calls as CallResultData[]}
        renderItem={renderRow}
        keyExtractor={(item: CallResultData) => item.CallId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={isPhone ? styles.phoneList : styles.tableList}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  numberCell: { width: 90, paddingRight: 8 },
  nameCell: { flex: 2, paddingRight: 8 },
  cell: { paddingRight: 8 },
  actionsCell: { width: 240, justifyContent: 'flex-end' },
  phoneList: { padding: 8, paddingBottom: 24 },
  tableList: { paddingBottom: 24 },
});
