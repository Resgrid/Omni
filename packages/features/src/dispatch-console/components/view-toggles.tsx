import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import { LayoutList, ListFilter } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useDashboardViewStore } from '../hooks/use-dashboard-view-store';

const Toggle: React.FC<{ label: string; icon: LucideIcon; active: boolean; onPress: () => void; testID: string }> = ({ label, icon: Icon, active, onPress, testID }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="switch"
    accessibilityState={{ checked: active }}
    className={`mr-2 flex-row items-center rounded-full px-3 py-1.5 ${active ? 'bg-primary-600' : 'bg-background-100'}`}
    testID={testID}
  >
    <View>
      <Icon size={12} color={active ? '#ffffff' : '#4b5563'} />
    </View>
    <Text className={`ml-1.5 text-xs font-medium ${active ? 'text-typography-0' : 'text-typography-700'}`}>{label}</Text>
  </Pressable>
);

/** "Available only" and "Single list" (units and personnel in one panel) for the console's resource panels. */
export const ViewToggles: React.FC = () => {
  const { t } = useTranslation();
  const availableOnly = useDashboardViewStore((state) => state.availableOnly);
  const singleList = useDashboardViewStore((state) => state.singleList);
  return (
    <HStack className="flex-wrap items-center px-2 pt-2" testID="console-view-toggles">
      <Toggle label={t('dispatch.available_only')} icon={ListFilter} active={availableOnly} onPress={() => useDashboardViewStore.getState().toggleAvailableOnly()} testID="toggle-available-only" />
      <Toggle label={t('dispatch.single_list')} icon={LayoutList} active={singleList} onPress={() => useDashboardViewStore.getState().toggleSingleList()} testID="toggle-single-list" />
    </HStack>
  );
};
