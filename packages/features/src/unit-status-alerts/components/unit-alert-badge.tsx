import { useTranslation } from '@resgrid/i18n';
import { HStack, Text, View } from '@resgrid/ui';
import { BellOff, CircleCheck, TriangleAlert } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import React from 'react';
import { StyleSheet } from 'react-native';

import { annotatedColors, formatElapsed, type UnitAlertAcknowledgementState, type UnitStatusAlertLevel } from '../lib/unit-status-alerts';

export interface UnitAlertBadgeProps {
  level: UnitStatusAlertLevel;
  acknowledgementState: UnitAlertAcknowledgementState;
  secondsInStatus: number | null;
  testID?: string;
}

/**
 * A unit's status timer in a list row (Dispatch's unit rows): red past the alert time, amber past the warning, with a
 * check once someone acknowledged it and a muted bell once muted. Renders nothing while the unit is within its timer.
 */
export const UnitAlertBadge: React.FC<UnitAlertBadgeProps> = React.memo(({ level, acknowledgementState, secondsInStatus, testID }) => {
  const { t } = useTranslation();
  const isDark = useColorScheme().colorScheme === 'dark';

  if (level === 'none') return null;
  const colors = annotatedColors(level, acknowledgementState, isDark);
  const Icon = acknowledgementState === 'muted' ? BellOff : acknowledgementState === 'acknowledged' ? CircleCheck : TriangleAlert;
  const elapsed = formatElapsed(secondsInStatus);

  return (
    <HStack
      space="xs"
      accessible
      accessibilityLabel={t(level === 'alert' ? 'unitAlerts.badgeAlert' : 'unitAlerts.badgeWarn', { elapsed })}
      className="items-center rounded px-1.5 py-0.5"
      style={StyleSheet.flatten([styles.badge, { backgroundColor: colors.background, borderColor: colors.edge, opacity: acknowledgementState === 'muted' ? 0.7 : 1 }])}
      testID={testID ? `${testID}-${level}${acknowledgementState === 'none' ? '' : `-${acknowledgementState}`}` : undefined}
    >
      <View>
        <Icon size={10} color={colors.edge} />
      </View>
      <Text className="text-xs font-bold" style={{ color: colors.edge }} numberOfLines={1}>
        {elapsed}
      </Text>
    </HStack>
  );
});

UnitAlertBadge.displayName = 'UnitAlertBadge';

const styles = StyleSheet.create({
  badge: { borderWidth: StyleSheet.hairlineWidth },
});
