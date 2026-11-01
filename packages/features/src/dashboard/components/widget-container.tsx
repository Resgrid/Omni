import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Spinner, Text, View } from '@resgrid/ui';
import { CloudOff, GripVertical, Settings, X } from 'lucide-react-native';
import React, { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';

export interface WidgetContainerProps {
  title: string;
  children: ReactNode;
  testID: string;
  isEditMode?: boolean;
  onRemove?: () => void;
  onConfigure?: () => void;
  /** Showing the last data this board had (offline, or the latest refresh failed). */
  stale?: boolean;
  /** Optional element right of the title (counts, badges). */
  headerRight?: ReactNode;
}

/**
 * The frame every widget draws in: a title bar (drag grip, settings and remove buttons in edit mode; a stale marker when
 * the data is the last known copy) and a clipped body. Sized by its grid cell, so it always fills its parent.
 */
export const WidgetContainer: React.FC<WidgetContainerProps> = ({ title, children, testID, isEditMode = false, onRemove, onConfigure, stale = false, headerRight }) => {
  const { t } = useTranslation();
  return (
    <View className="flex-1 overflow-hidden rounded-lg border border-outline-200 bg-background-0" testID={testID}>
      <HStack className={isEditMode ? 'items-center border-b border-outline-200 bg-background-100 px-3 py-2' : 'items-center border-b border-outline-100 bg-background-50 px-3 py-2'} space="sm">
        {isEditMode ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <GripVertical size={16} color="#6b7280" />
          </View>
        ) : null}
        <Text className="flex-1 text-sm font-semibold text-typography-900" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {stale ? (
          <HStack space="xs" className="items-center" testID={`${testID}-stale`} accessibilityLabel={t('dashboard.stale_hint')}>
            <View>
              <CloudOff size={14} color="#d97706" />
            </View>
            <Text className="text-xs text-warning-600">{t('dashboard.stale')}</Text>
          </HStack>
        ) : null}
        {headerRight ?? null}
        {isEditMode && onConfigure ? (
          <Pressable onPress={onConfigure} className="p-1" hitSlop={8} accessibilityRole="button" accessibilityLabel={t('dashboard.configure_widget', { name: title })} testID={`${testID}-configure-button`}>
            <Settings size={16} color="#6b7280" />
          </Pressable>
        ) : null}
        {isEditMode && onRemove ? (
          <Pressable onPress={onRemove} className="p-1" hitSlop={8} accessibilityRole="button" accessibilityLabel={t('dashboard.remove_widget', { name: title })} testID={`${testID}-remove-button`}>
            <X size={16} color="#dc2626" />
          </Pressable>
        ) : null}
      </HStack>
      <View style={styles.body}>{children}</View>
    </View>
  );
};

export const WidgetLoading: React.FC<{ testID?: string }> = ({ testID }) => (
  <View style={styles.center} testID={testID}>
    <Spinner size="small" />
  </View>
);

export interface WidgetMessageProps {
  message: string;
  tone?: 'muted' | 'error' | 'warning';
  testID?: string;
  children?: ReactNode;
}

/** A centred message (empty, error, not configured) in the widget body. */
export const WidgetMessage: React.FC<WidgetMessageProps> = ({ message, tone = 'muted', testID, children }) => (
  <View style={styles.center} testID={testID}>
    <Text className={tone === 'error' ? 'text-center text-sm text-error-600' : tone === 'warning' ? 'text-center text-sm text-warning-700' : 'text-center text-sm text-typography-500'}>{message}</Text>
    {children ?? null}
  </View>
);

const styles = StyleSheet.create({
  body: { flex: 1, overflow: 'hidden', padding: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
});
