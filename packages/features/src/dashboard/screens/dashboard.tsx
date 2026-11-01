import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, HStack, ScrollView, View, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { LayoutDashboard } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet } from 'react-native';

import { AddWidgetMenu } from '../components/add-widget-menu';
import { DashboardGrid } from '../components/dashboard-grid';
import { DashboardHeaderActions } from '../components/dashboard-header-actions';
import { useDashboardData } from '../hooks/use-dashboard-data';
import { type DashboardWidget, useDashboardStore } from '../hooks/use-dashboard-store';
import { useDashboardViewStore } from '../hooks/use-dashboard-view-store';
import { useGridConfig } from '../hooks/use-grid-config';
import { layoutWidgets } from '../lib/grid';
import type { WidgetType } from '../lib/widget-types';
import { dashboardRoutes } from '../routes';

export interface DashboardScreenProps {
  /** Render the Edit / Configure / Add toolbar above the board (default). Off when the shell puts `DashboardHeaderActions` in its app bar. */
  showToolbar?: boolean;
  /** Where the Configure buttons go; defaults to the configure route (`?widget=` for one widget's settings). */
  onOpenConfigure?: (widget: WidgetType | null) => void;
}

/**
 * BigBoard's home: the widget board on a responsive grid (phone → wall), loading and live-refreshing only what its
 * widgets need, readable offline from the persisted stores. Layout and widget settings are per device.
 */
export default function DashboardScreen({ showToolbar = true, onOpenConfigure }: DashboardScreenProps) {
  const { t } = useTranslation();
  const widgets = useDashboardStore((state) => state.widgets);
  const addWidget = useDashboardStore((state) => state.addWidget);
  const removeWidget = useDashboardStore((state) => state.removeWidget);
  const moveWidget = useDashboardStore((state) => state.moveWidget);
  const resizeWidget = useDashboardStore((state) => state.resizeWidget);
  const isEditMode = useDashboardViewStore((state) => state.isEditMode);
  const showAddMenu = useDashboardViewStore((state) => state.showAddMenu);
  const setShowAddMenu = useDashboardViewStore((state) => state.setShowAddMenu);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const config = useGridConfig(containerWidth);
  const layout = useMemo(() => layoutWidgets(widgets, config.numColumns), [config.numColumns, widgets]);
  const types = useMemo(() => widgets.map((widget) => widget.type), [widgets]);

  useDashboardData(types);

  const openConfigure = useCallback((widget: WidgetType | null) => (onOpenConfigure ? onOpenConfigure(widget) : router.push(dashboardRoutes.configure(widget))), [onOpenConfigure]);
  const handleLayout = useCallback((event: LayoutChangeEvent) => setContainerWidth(Math.round(event.nativeEvent.layout.width)), []);
  const handleAdd = useCallback((type: WidgetType) => void addWidget(type, config), [addWidget, config]);
  const handleMove = useCallback((id: string, cell: { x: number; y: number }) => moveWidget(id, cell, config.numColumns), [config.numColumns, moveWidget]);
  const handleResize = useCallback((id: string, size: { w: number; h: number }) => resizeWidget(id, size, config.numColumns), [config.numColumns, resizeWidget]);
  const handleConfigureWidget = useCallback((widget: DashboardWidget) => openConfigure(widget.type), [openConfigure]);

  return (
    <View className="flex-1 bg-background-50" testID="dashboard-screen" onLayout={handleLayout}>
      {showToolbar ? (
        <HStack className="items-center justify-end border-b border-outline-100 bg-background-0 px-3 py-1.5" testID="dashboard-toolbar">
          <DashboardHeaderActions onConfigure={() => openConfigure(null)} numColumns={config.numColumns} />
        </HStack>
      ) : null}
      {showAddMenu ? <AddWidgetMenu usedTypes={types} onAdd={handleAdd} onClose={() => setShowAddMenu(false)} /> : null}
      {widgets.length === 0 ? (
        <ZeroState icon={LayoutDashboard} heading={t('dashboard.empty_title')} description={t('dashboard.empty_description')} testID="dashboard-empty">
          <Button className="mt-4" onPress={() => setShowAddMenu(true)} testID="dashboard-empty-add">
            <ButtonText>{t('dashboard.add_widget')}</ButtonText>
          </Button>
        </ZeroState>
      ) : (
        <ScrollView style={styles.fill} scrollEnabled={!isDragging} testID="dashboard-scroll">
          <DashboardGrid
            widgets={widgets}
            layout={layout}
            config={config}
            isEditMode={isEditMode}
            onMove={handleMove}
            onResize={handleResize}
            onRemove={removeWidget}
            onConfigure={handleConfigureWidget}
            onDragStateChange={setIsDragging}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
