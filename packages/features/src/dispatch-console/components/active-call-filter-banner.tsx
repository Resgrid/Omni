import { useCallsStore } from '@resgrid/data';
import { readableTextColor, resolvePriority } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { HStack, Pressable, Text } from '@resgrid/ui';
import { AlertTriangle, X } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface ActiveCallFilterBannerProps {
  call: CallResultData;
  onClearFilter: () => void;
}

/** The strip in the call's priority colour while the console is filtered to one call. */
export const ActiveCallFilterBanner: React.FC<ActiveCallFilterBannerProps> = ({ call, onClearFilter }) => {
  const { t } = useTranslation();
  const priorities = useCallsStore((state) => state.callPriorities);
  const color = resolvePriority(priorities, call.Priority)?.color || '#6366f1';
  const textColor = readableTextColor(color) ?? '#FFFFFF';

  return (
    <View style={StyleSheet.flatten([styles.banner, { backgroundColor: color }])} testID="active-call-filter-banner">
      <HStack space="sm" className="flex-1 items-center">
        <View>
          <AlertTriangle size={16} color={textColor} />
        </View>
        <Text className="flex-1 text-sm font-semibold" style={{ color: textColor }} numberOfLines={1}>
          {`${t('dispatch.filtering_by_call')}: #${call.Number} - ${call.Name || call.Nature}`}
        </Text>
      </HStack>
      <Pressable onPress={onClearFilter} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('dispatch.clear_filter')} style={styles.clear} testID="active-call-filter-clear">
        <HStack space="xs" className="items-center">
          <Text className="text-xs font-medium" style={{ color: textColor }}>
            {t('dispatch.clear_filter')}
          </Text>
          <View>
            <X size={12} color={textColor} />
          </View>
        </HStack>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 8, marginTop: 8 },
  clear: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
});
