import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text, useFormFactor, useThemeColors } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import { LayoutList, ListFilter } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useDashboardViewStore } from '../hooks/use-dashboard-view-store';

const Toggle: React.FC<{ label: string; icon: LucideIcon; active: boolean; iconOnly: boolean; onPress: () => void; testID: string }> = ({ label, icon: Icon, active, iconOnly, onPress, testID }) => {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      className={`flex-row items-center rounded-full py-1.5 ${iconOnly ? 'px-2' : 'px-3'} ${active ? 'bg-primary-600' : ''}`}
      style={active ? styles.spacing : StyleSheet.flatten([styles.spacing, styles.inactive])}
      testID={testID}
    >
      <View>
        <Icon size={14} color={active ? colors.textInverse : colors.textMuted} />
      </View>
      {iconOnly ? null : <Text className={`ml-1.5 text-xs font-medium ${active ? 'text-typography-0' : 'text-typography-700'}`}>{label}</Text>}
    </Pressable>
  );
};

export interface ViewTogglesProps {
  /** In the app bar (Dispatch's header): no padding of its own, and icon-only on phones so the title keeps its room. */
  inHeader?: boolean;
}

/** "Available only" and "Single list" (units and personnel in one panel) for the console's resource panels. */
export const ViewToggles: React.FC<ViewTogglesProps> = ({ inHeader = false }) => {
  const { t } = useTranslation();
  const { isPhone } = useFormFactor();
  const availableOnly = useDashboardViewStore((state) => state.availableOnly);
  const singleList = useDashboardViewStore((state) => state.singleList);
  const iconOnly = inHeader && isPhone;

  return (
    <HStack className={inHeader ? 'items-center' : 'flex-wrap items-center px-2 pt-2'} testID="console-view-toggles">
      <Toggle label={t('dispatch.available_only')} icon={ListFilter} active={availableOnly} iconOnly={iconOnly} onPress={() => useDashboardViewStore.getState().toggleAvailableOnly()} testID="toggle-available-only" />
      <Toggle label={t('dispatch.single_list')} icon={LayoutList} active={singleList} iconOnly={iconOnly} onPress={() => useDashboardViewStore.getState().toggleSingleList()} testID="toggle-single-list" />
    </HStack>
  );
};

const styles = StyleSheet.create({
  spacing: { marginRight: 8 },
  // Dispatch's translucent slate pill: reads on the app bar and on the canvas in both modes.
  inactive: { backgroundColor: 'rgba(148, 163, 184, 0.18)' },
});
