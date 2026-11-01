import { safeFormatTimestamp } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { Card, HStack, Pressable, Text, VStack } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import { CloudOff } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { labelColor } from '../lib/label-colors';

export interface MemberStateCardProps {
  /** "My Status" / "My Staffing". */
  title: string;
  icon: LucideIcon;
  /** The department's name for the current value; `unknownText` when there is none. */
  text: string | null;
  unknownText: string;
  /** Server colour (hex or a legacy label class). */
  color?: string | null;
  /** Local wall-clock timestamp of the last change. */
  timestamp?: string | null;
  /** Extra line (the status destination). */
  detail?: string | null;
  /** A newer value queued on the device: shown instead of `text` until it syncs. */
  pendingText?: string | null;
  isPending?: boolean;
  isLoading?: boolean;
  /** Opens the status/staffing sheet. */
  onPress?: () => void;
  testID: string;
}

/** One of the two cards at the top of the member home: the member's current status or staffing, its colour and time. */
export const MemberStateCard: React.FC<MemberStateCardProps> = ({ title, icon: Icon, text, unknownText, color, timestamp, detail, pendingText, isPending = false, isLoading = false, onPress, testID }) => {
  const { t } = useTranslation();

  if (isLoading && !text) {
    return (
      <Card className="bg-background-50 p-4" testID={testID}>
        <View style={styles.skeleton} className="rounded bg-background-200" testID={`${testID}-loading`} />
      </Card>
    );
  }

  const displayColor = labelColor(color);
  const updated = timestamp ? safeFormatTimestamp(timestamp, 'h:mm tt') : '';
  const shown = pendingText || text || unknownText;

  const body = (
    <Card className="bg-background-50 p-2" style={StyleSheet.flatten([styles.card, { borderLeftColor: displayColor }])} testID={testID}>
      <VStack space="xs">
        <HStack className="items-center" space="sm">
          <View style={styles.iconBox} className="rounded-lg bg-typography-500">
            <Icon size={16} color="#ffffff" />
          </View>
          <Text className="flex-1 text-sm font-medium text-typography-600" numberOfLines={1}>
            {title}
          </Text>
        </HStack>
        <Text className="text-lg font-bold" style={{ color: displayColor }} numberOfLines={2} testID={`${testID}-text`}>
          {shown}
        </Text>
        {isPending ? (
          <HStack space="xs" className="items-center" testID={`${testID}-pending`}>
            <CloudOff size={12} color="#6b7280" />
            <Text className="text-xs text-typography-500">{t('status.pending_sync')}</Text>
          </HStack>
        ) : null}
        {detail ? (
          <Text className="text-xs text-typography-500" numberOfLines={2} testID={`${testID}-detail`}>
            {detail}
          </Text>
        ) : null}
        {updated ? <Text className="text-xs text-typography-500">{`${t('home.user.updated')}: ${updated}`}</Text> : null}
      </VStack>
    </Card>
  );

  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}: ${shown}`} testID={`${testID}-press`}>
      {body}
    </Pressable>
  ) : (
    body
  );
};

const styles = StyleSheet.create({
  card: { borderLeftWidth: 4 },
  iconBox: { padding: 8 },
  skeleton: { height: 64 },
});
