import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, ScrollView, Text, View } from '@resgrid/ui';
import { X } from 'lucide-react-native';
import React from 'react';

import { WIDGET_ICONS, WIDGET_LABEL_KEYS, WIDGET_TYPES, type WidgetType } from '../lib/widget-types';

export interface AddWidgetMenuProps {
  /** Types already on the board (a board shows each type once). */
  usedTypes: readonly WidgetType[];
  onAdd: (type: WidgetType) => void;
  onClose: () => void;
}

/** The strip of widget types that can still be added. */
export const AddWidgetMenu: React.FC<AddWidgetMenuProps> = ({ usedTypes, onAdd, onClose }) => {
  const { t } = useTranslation();
  const available = WIDGET_TYPES.filter((type) => !usedTypes.includes(type));
  return (
    <View className="border-b border-outline-200 bg-background-50 px-3 py-2" testID="dashboard-add-menu">
      <HStack className="mb-2 items-center justify-between">
        <Text className="text-sm font-semibold text-typography-900">{t('dashboard.add_widget')}</Text>
        <Pressable onPress={onClose} className="p-1" hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="dashboard-add-menu-close">
          <X size={18} color="#6b7280" />
        </Pressable>
      </HStack>
      {available.length === 0 ? (
        <Text className="text-sm text-typography-500" testID="dashboard-add-menu-all-added">
          {t('dashboard.all_widgets_added')}
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <HStack space="sm">
            {available.map((type) => {
              const Icon = WIDGET_ICONS[type];
              return (
                <Pressable
                  key={type}
                  onPress={() => onAdd(type)}
                  className="flex-row items-center rounded-lg border border-outline-300 bg-background-0 px-3 py-2"
                  accessibilityRole="button"
                  accessibilityLabel={t('dashboard.add_named_widget', { name: t(WIDGET_LABEL_KEYS[type]) })}
                  testID={`add-widget-${type}`}
                >
                  <View className="mr-2">
                    <Icon size={16} color="#6b7280" />
                  </View>
                  <Text className="text-sm text-typography-900">{t(WIDGET_LABEL_KEYS[type])}</Text>
                </Pressable>
              );
            })}
          </HStack>
        </ScrollView>
      )}
    </View>
  );
};
