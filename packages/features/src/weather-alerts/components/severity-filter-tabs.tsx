import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, ScrollView, Text } from '@resgrid/ui';
import React from 'react';

import { SEVERITY_TABS, severityKey, type SeverityTab } from '../lib/weather-alert-format';

export interface SeverityFilterTabsProps {
  value: SeverityTab;
  onChange: (tab: SeverityTab) => void;
  /** Alerts per tab, shown as counts. */
  counts?: Partial<Record<string, number>>;
}

/** All / Extreme / Severe / Moderate / Minor (U/I severity tabs). */
export const SeverityFilterTabs: React.FC<SeverityFilterTabsProps> = ({ value, onChange, counts }) => {
  const { t } = useTranslation();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2 max-h-10">
      <HStack space="sm">
        {SEVERITY_TABS.map((tab) => {
          const selected = tab === value;
          const label = tab === 'all' ? t('weather_alerts.filter.all') : t(severityKey(tab));
          const count = counts?.[String(tab)];
          return (
            <Pressable
              key={String(tab)}
              testID={`weather-severity-tab-${tab}`}
              onPress={() => onChange(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              className={`rounded-full px-3 py-1.5 ${selected ? 'bg-primary-500' : 'bg-background-100'}`}
            >
              <Text className={`text-sm font-medium ${selected ? 'text-typography-0' : 'text-typography-700'}`}>{count !== undefined ? `${label} (${count})` : label}</Text>
            </Pressable>
          );
        })}
      </HStack>
    </ScrollView>
  );
};
