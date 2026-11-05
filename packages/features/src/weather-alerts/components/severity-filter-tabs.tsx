import { useTranslation } from '@resgrid/i18n';
import { TabBar, type TabBarItem } from '@resgrid/ui';
import React from 'react';

import { SEVERITY_TABS, severityKey, type SeverityTab } from '../lib/weather-alert-format';

export interface SeverityFilterTabsProps {
  value: SeverityTab;
  onChange: (tab: SeverityTab) => void;
  /** Alerts per tab, shown as counts. */
  counts?: Partial<Record<string, number>>;
}

/** All / Extreme / Severe / Moderate / Minor (U/I severity tabs): the page tab strip at the top of the alert list. */
export const SeverityFilterTabs: React.FC<SeverityFilterTabsProps> = ({ value, onChange, counts }) => {
  const { t } = useTranslation();
  const tabs: TabBarItem[] = SEVERITY_TABS.map((tab) => {
    const label = tab === 'all' ? t('weather_alerts.filter.all') : t(severityKey(tab));
    const count = counts?.[String(tab)];

    return { key: String(tab), label: count !== undefined ? `${label} (${count})` : label, testID: `weather-severity-tab-${tab}` };
  });

  // The bar keys are strings; the severities are numbers.
  const select = (_key: string, index: number) => {
    const tab = SEVERITY_TABS[index];

    if (tab !== undefined) onChange(tab);
  };

  return <TabBar tabs={tabs} activeKey={String(value)} onChange={select} variant="pills" testID="weather-severity-tabs" />;
};
