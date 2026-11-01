import { useTranslation } from '@resgrid/i18n';
import { Input, InputField, Pressable, Text } from '@resgrid/ui';
import { Search, X } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { CallListFilters } from '../lib/call-filters';
import type { PriorityOption } from '../lib/call-priority';
import { OptionChips } from './option-chips';

export interface CallFiltersBarProps {
  filters: CallListFilters;
  onChange: (filters: CallListFilters) => void;
  priorities: readonly PriorityOption[];
  testID?: string;
}

/** Search plus priority filter chips. View state only (plan §5.5). */
export const CallFiltersBar: React.FC<CallFiltersBarProps> = ({ filters, onChange, priorities, testID = 'call-filters' }) => {
  const { t } = useTranslation();
  const togglePriority = (id: number) => onChange({ ...filters, priorityIds: filters.priorityIds.includes(id) ? filters.priorityIds.filter((value) => value !== id) : [...filters.priorityIds, id] });
  return (
    <View style={styles.container} testID={testID}>
      <Input variant="outline" size="md" className="mb-2">
        <View style={styles.searchIcon}>
          <Search size={18} color="#6B7280" />
        </View>
        <InputField
          value={filters.query}
          onChangeText={(query: string) => onChange({ ...filters, query })}
          placeholder={t('calls.search')}
          accessibilityLabel={t('common.search')}
          returnKeyType="search"
          testID={`${testID}-search`}
        />
        {filters.query ? (
          <Pressable onPress={() => onChange({ ...filters, query: '' })} accessibilityRole="button" accessibilityLabel={t('common.clear_search')} className="justify-center px-2" testID={`${testID}-clear`}>
            <X size={18} color="#6B7280" />
          </Pressable>
        ) : null}
      </Input>
      {priorities.length > 1 ? (
        <View>
          <Text size="xs" className="mb-1 text-typography-500">
            {t('calls.priority')}
          </Text>
          <OptionChips
            mode="multiple"
            scroll
            options={priorities.map((priority) => ({ value: priority.id, label: priority.isLabelKey ? t(priority.label) : priority.label, color: priority.color }))}
            selected={filters.priorityIds}
            onToggle={togglePriority}
            accessibilityLabel={t('calls.filters.priority')}
            testID={`${testID}-priority`}
          />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingTop: 8 },
  searchIcon: { justifyContent: 'center', paddingLeft: 10 },
});
