import { useActiveVariant } from '@resgrid/config';
import { useStatusContext } from '@resgrid/features/status';
import { useUnitStatusTimer } from '@resgrid/features/unit-status-alerts';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Text } from '@resgrid/ui';
import { type Href, useRouter } from 'expo-router';
import { ChevronRight, CircleCheck, Timer } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { timerToneColors, unitTimerText } from '../lib/status-timer-text';
import { unitStatusRoutes } from '../routes';

export interface StatusTimerBannerProps {
  /** The shell hides it on the status console, which shows the timer card itself. */
  hidden?: boolean;
  /** Overrides navigation (default: the status console). */
  onPress?: () => void;
}

const ActiveUnitTimerBanner: React.FC<{ unitId: string; onPress?: () => void }> = ({ unitId, onPress }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const isDark = useColorScheme().colorScheme === 'dark';
  const timer = useUnitStatusTimer(unitId);

  // Only close to or past the timer, and not once dispatch muted it (dispatch knows; the console card still shows it).
  if (!timer.hasTimer || !timer.unit || timer.acknowledgementState === 'muted' || (timer.alert.level === 'none' && !timer.approaching)) return null;
  const text = unitTimerText(t, timer, timer.unit.CurrentStatus || t('common.unknown'));
  const colors = timerToneColors(text.tone, isDark);
  const label = [text.headline, text.detail].filter((part) => !!part).join('. ');
  // SAFETY: `/console` is declared by every app with the unit status module, which is the only place this renders.
  const openConsole = () => router.push(unitStatusRoutes.console() as Href);

  return (
    <Pressable
      onPress={onPress ?? openConsole}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('unit_status.timer_update_status')}
      accessibilityLiveRegion={timer.alert.level === 'none' ? 'none' : 'polite'}
      testID={`unit-status-timer-banner-${text.tone}`}
    >
      <View className="border-b border-outline-200 px-3 py-1.5" style={StyleSheet.flatten([styles.strip, { borderLeftColor: colors.edge, backgroundColor: colors.background }])}>
        <HStack space="sm" className="items-center justify-between">
          <HStack space="sm" className="shrink items-center">
            <View>
              <Timer size={14} color={colors.edge} />
            </View>
            <Text size="sm" className="shrink font-semibold text-typography-900" numberOfLines={1} testID="unit-status-timer-banner-headline">
              {text.headline}
            </Text>
            {timer.acknowledgementState === 'acknowledged' ? (
              <View accessible accessibilityLabel={t('unitAlerts.acknowledged')} testID="unit-status-timer-banner-acknowledged">
                <CircleCheck size={14} color={colors.edge} />
              </View>
            ) : null}
          </HStack>
          <HStack space="xs" className="items-center">
            <Text size="xs" className="font-medium text-typography-700">
              {t('unit_status.timer_update_status')}
            </Text>
            <View>
              <ChevronRight size={14} color={colors.edge} />
            </View>
          </HStack>
        </HStack>
      </View>
    </Pressable>
  );
};

/**
 * The unit's status timer as a strip under the app bar on every screen (the map home included), shown once the timer is
 * close or has fired: the crew knows before, or as soon as, dispatch's console flags them. Opens the status console. Only
 * in apps with the unit status console (manifest module `unit-status`) and an active unit.
 */
export const StatusTimerBanner: React.FC<StatusTimerBannerProps> = ({ hidden = false, onPress }) => {
  const hasConsole = useActiveVariant().modules.includes('unit-status');
  const { activeUnitId } = useStatusContext();

  return !hasConsole || !activeUnitId || hidden ? null : <ActiveUnitTimerBanner unitId={activeUnitId} onPress={onPress} />;
};

const styles = StyleSheet.create({
  strip: { borderLeftWidth: 4 },
});
