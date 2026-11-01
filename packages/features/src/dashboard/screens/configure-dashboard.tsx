import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, HStack, Pressable, ScrollView, Text, View, VStack } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowUp, LayoutGrid, Plus, RotateCcw, Trash2 } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { NumberStepper, SettingsSection } from '../components/configure/setting-controls';
import { WIDGET_SETTINGS_SECTION, WidgetSettingsPanel } from '../components/configure/widget-settings-panel';
import { useDashboardStore } from '../hooks/use-dashboard-store';
import { useGridConfig } from '../hooks/use-grid-config';
import { useWidgetSettingsStore } from '../hooks/use-widget-settings-store';
import { WIDGET_ICONS, WIDGET_LABEL_KEYS, WIDGET_TYPES, type WidgetType } from '../lib/widget-types';
import { parseConfigureWidgetParam } from '../routes';

export interface ConfigureDashboardScreenProps {
  /** Widget type to open on (else `?widget=`, else the first widget on the board). */
  initialWidget?: WidgetType;
  /** Called by Done; defaults to going back. */
  onDone?: () => void;
}

/**
 * Configure the board (BigBoard `configure`): pick a widget type, add or remove it, set its size and its place in the
 * board order (which re-packs the board), and edit its settings. Every change saves immediately to this device.
 */
export default function ConfigureDashboardScreen({ initialWidget, onDone }: ConfigureDashboardScreenProps) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ widget?: string | string[] }>();
  const widgets = useDashboardStore((state) => state.widgets);
  const addWidget = useDashboardStore((state) => state.addWidget);
  const removeWidget = useDashboardStore((state) => state.removeWidget);
  const setWidgetSize = useDashboardStore((state) => state.setWidgetSize);
  const reorderWidget = useDashboardStore((state) => state.reorderWidget);
  const arrangeWidgets = useDashboardStore((state) => state.arrangeWidgets);
  const resetSection = useWidgetSettingsStore((state) => state.resetSection);
  const grid = useGridConfig();
  const [selected, setSelected] = useState<WidgetType>(() => initialWidget ?? parseConfigureWidgetParam(params.widget) ?? widgets[0]?.type ?? WIDGET_TYPES[0] ?? 'calls');

  const onBoard = useMemo(() => new Set(widgets.map((widget) => widget.type)), [widgets]);
  const widget = widgets.find((entry) => entry.type === selected) ?? null;
  const index = widget ? widgets.indexOf(widget) : -1;
  const section = WIDGET_SETTINGS_SECTION[selected];
  const label = t(WIDGET_LABEL_KEYS[selected]);
  const handleDone = useCallback(() => (onDone ? onDone() : router.back()), [onDone]);

  return (
    <View className="flex-1 bg-background-50" testID="configure-dashboard-screen">
      <View className="border-b border-outline-200 bg-background-0">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {WIDGET_TYPES.map((type) => {
            const Icon = WIDGET_ICONS[type];
            const active = type === selected;
            return (
              <Pressable
                key={type}
                onPress={() => setSelected(type)}
                className={
                  active
                    ? 'mr-2 flex-row items-center rounded-full bg-primary-500 px-3 py-1.5'
                    : onBoard.has(type)
                      ? 'mr-2 flex-row items-center rounded-full border border-outline-300 px-3 py-1.5'
                      : 'mr-2 flex-row items-center rounded-full border border-outline-200 px-3 py-1.5 opacity-60'
                }
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityHint={onBoard.has(type) ? t('dashboard.on_board') : t('dashboard.not_on_board')}
                testID={`configure-tab-${type}`}
              >
                <View className="mr-1.5">
                  <Icon size={14} color={active ? '#ffffff' : '#6b7280'} />
                </View>
                <Text className={active ? 'text-sm font-medium text-typography-0' : 'text-sm text-typography-800'}>{t(WIDGET_LABEL_KEYS[type])}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
        <VStack space="md" className="mx-auto w-full max-w-3xl" testID={`configure-${selected}-content`}>
          <HStack className="items-center justify-between">
            <Text className="flex-1 text-xl font-bold text-typography-900" accessibilityRole="header">
              {label}
            </Text>
            {widget ? (
              <Button size="sm" variant="outline" action="negative" onPress={() => removeWidget(widget.id)} testID="configure-remove-widget">
                <Trash2 size={14} color="#dc2626" />
                <ButtonText className="ml-1">{t('dashboard.remove_from_board')}</ButtonText>
              </Button>
            ) : (
              <Button size="sm" onPress={() => void addWidget(selected, grid)} testID="configure-add-widget">
                <Plus size={14} color="#ffffff" />
                <ButtonText className="ml-1">{t('dashboard.add_to_board')}</ButtonText>
              </Button>
            )}
          </HStack>

          {widget ? (
            <SettingsSection title={t('configure.widget_size')} testID="configure-board-section">
              <NumberStepper
                label={t('dashboard.width')}
                value={Math.min(widget.w, grid.maxWidgetWidth)}
                min={1}
                max={grid.maxWidgetWidth}
                onChange={(w) => setWidgetSize(widget.id, { w, h: widget.h })}
                testID="configure-width"
              />
              <NumberStepper
                label={t('dashboard.height')}
                value={Math.min(widget.h, grid.maxWidgetHeight)}
                min={1}
                max={grid.maxWidgetHeight}
                onChange={(h) => setWidgetSize(widget.id, { w: widget.w, h })}
                testID="configure-height"
              />
              <HStack className="items-center justify-between" space="sm">
                <Text className="flex-1 text-sm text-typography-800">{t('dashboard.board_order', { position: index + 1, count: widgets.length })}</Text>
                <Pressable
                  onPress={() => reorderWidget(widget.id, -1, grid.numColumns)}
                  disabled={index <= 0}
                  className={index <= 0 ? 'rounded border border-outline-200 p-2 opacity-40' : 'rounded border border-outline-300 p-2'}
                  accessibilityRole="button"
                  accessibilityLabel={t('dashboard.move_earlier', { name: label })}
                  testID="configure-move-earlier"
                >
                  <ArrowUp size={14} color="#6b7280" />
                </Pressable>
                <Pressable
                  onPress={() => reorderWidget(widget.id, 1, grid.numColumns)}
                  disabled={index >= widgets.length - 1}
                  className={index >= widgets.length - 1 ? 'rounded border border-outline-200 p-2 opacity-40' : 'rounded border border-outline-300 p-2'}
                  accessibilityRole="button"
                  accessibilityLabel={t('dashboard.move_later', { name: label })}
                  testID="configure-move-later"
                >
                  <ArrowDown size={14} color="#6b7280" />
                </Pressable>
              </HStack>
              <Text className="text-xs text-typography-500">{t('dashboard.board_order_hint')}</Text>
            </SettingsSection>
          ) : (
            <Text className="text-sm text-typography-600" testID="configure-not-on-board">
              {t('dashboard.not_on_board_hint')}
            </Text>
          )}

          <WidgetSettingsPanel type={selected} />

          <HStack space="sm" className="flex-wrap">
            {section ? (
              <Button size="sm" variant="outline" onPress={() => resetSection(section)} testID="configure-reset-settings">
                <RotateCcw size={14} color="#6b7280" />
                <ButtonText className="ml-1">{t('dashboard.reset_settings')}</ButtonText>
              </Button>
            ) : null}
            {widgets.length > 1 ? (
              <Button size="sm" variant="outline" onPress={() => arrangeWidgets(grid.numColumns)} testID="configure-arrange">
                <LayoutGrid size={14} color="#6b7280" />
                <ButtonText className="ml-1">{t('dashboard.arrange')}</ButtonText>
              </Button>
            ) : null}
          </HStack>
        </VStack>
      </ScrollView>

      <View className="border-t border-outline-200 bg-background-0 p-3">
        <Button size="lg" onPress={handleDone} testID="configure-done-button">
          <ButtonText>{t('common.done')}</ButtonText>
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  tabs: { paddingHorizontal: 8, paddingVertical: 8 },
  content: { padding: 16, paddingBottom: 48 },
});
