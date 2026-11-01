import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, HStack, Pressable, Text, View } from '@resgrid/ui';
import { router } from 'expo-router';
import { Plus, Settings } from 'lucide-react-native';
import React, { useCallback } from 'react';

import { useDashboardStore } from '../hooks/use-dashboard-store';
import { useDashboardViewStore } from '../hooks/use-dashboard-view-store';
import { dashboardRoutes } from '../routes';

export interface DashboardHeaderActionsProps {
  /** Where Configure goes; defaults to the configure route. */
  onConfigure?: () => void;
  /** Column count shown while editing. */
  numColumns?: number;
}

/**
 * Edit / Done, Configure and Add widget (BigBoard's header controls). The dashboard renders these in its own toolbar;
 * a shell that prefers them in the app bar can place this component there and hide the toolbar.
 */
export const DashboardHeaderActions: React.FC<DashboardHeaderActionsProps> = ({ onConfigure, numColumns }) => {
  const { t } = useTranslation();
  const isEditMode = useDashboardViewStore((state) => state.isEditMode);
  const toggleEditMode = useDashboardViewStore((state) => state.toggleEditMode);
  const setShowAddMenu = useDashboardViewStore((state) => state.setShowAddMenu);
  const widgetCount = useDashboardStore((state) => state.widgets.length);
  const handleConfigure = useCallback(() => (onConfigure ? onConfigure() : router.push(dashboardRoutes.configure())), [onConfigure]);

  return (
    <HStack space="sm" className="items-center" testID="dashboard-header-actions">
      {isEditMode && numColumns ? (
        <View className="rounded bg-background-100 px-2 py-1">
          <Text className="text-xs text-typography-700" testID="dashboard-grid-info">
            {t('dashboard.grid_info', { columns: numColumns, count: widgetCount })}
          </Text>
        </View>
      ) : null}
      <Button size="sm" variant={isEditMode ? 'solid' : 'outline'} onPress={toggleEditMode} testID="dashboard-edit-button" accessibilityState={{ selected: isEditMode }}>
        <ButtonText>{isEditMode ? t('common.done') : t('common.edit')}</ButtonText>
      </Button>
      <Pressable onPress={handleConfigure} className="rounded p-2" hitSlop={6} accessibilityRole="button" accessibilityLabel={t('dashboard.configure_title')} testID="dashboard-configure-button">
        <Settings size={20} color="#6b7280" />
      </Pressable>
      <Pressable onPress={() => setShowAddMenu(true)} className="rounded p-2" hitSlop={6} accessibilityRole="button" accessibilityLabel={t('dashboard.add_widget')} testID="dashboard-add-button">
        <Plus size={20} color="#6b7280" />
      </Pressable>
    </HStack>
  );
};
