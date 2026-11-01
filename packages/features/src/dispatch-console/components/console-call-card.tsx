import { DispatchTicker, readableTextColor, timeAgo } from '@resgrid/features/calls';
import { AlarmLevelBadge } from '@resgrid/features/runcards';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData, DispatchedEventResultData } from '@resgrid/models';
import { Badge, BadgeText, HStack, Pressable, Text, TypeIcon } from '@resgrid/ui';
import { Clock, ExternalLink, MapPin, Navigation, Radio, UserPlus } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { plainText } from '../lib/console-filters';

export interface ConsoleCallCardProps {
  call: CallResultData;
  priorityColor: string;
  dispatches: readonly DispatchedEventResultData[];
  /** Names of dispatched resources with an overdue/critical check-in on this call. */
  overdueNames: readonly string[];
  isSelected: boolean;
  now: number;
  onSelect: (callId: string) => void;
  onOpenDetails: (callId: string) => void;
  /** Present with the create-calls right: dispatch additional resources to the call. */
  onAddResources?: (call: CallResultData) => void;
}

const TIME_AGO_KEYS = { just_now: 'dispatch_console.time_just_now', minutes: 'dispatch_console.time_minutes', hours: 'dispatch_console.time_hours', days: 'dispatch_console.time_days' } as const;

/**
 * A compact call card for the console (Dispatch baseline dashboard card) in the call's priority colour: number and age,
 * type icon and name, address, destination, nature, alarm level and the dispatched-resources ticker (shared calls
 * ticker). Pressing it filters the console to the call; the corner buttons open its detail or add resources.
 */
export const ConsoleCallCard: React.FC<ConsoleCallCardProps> = React.memo(({ call, priorityColor, dispatches, overdueNames, isSelected, now, onSelect, onOpenDetails, onAddResources }) => {
  const { t } = useTranslation();
  const textColor = readableTextColor(priorityColor) ?? '#FFFFFF';
  const nature = useMemo(() => plainText(call.Nature), [call.Nature]);
  const destination = call.DestinationName ? (call.DestinationTypeName ? `${call.DestinationTypeName}: ${call.DestinationName}` : call.DestinationName) : '';
  const age = timeAgo(call.LoggedOnUtc, now);
  const ageText = age ? t(TIME_AGO_KEYS[age.unit], { count: age.count }) : '';
  const testID = `console-call-${call.CallId}`;

  return (
    <Pressable
      onPress={() => onSelect(call.CallId)}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`#${call.Number} ${call.Name}`}
      style={StyleSheet.flatten([styles.card, { backgroundColor: priorityColor }, isSelected ? styles.selected : null])}
      testID={testID}
    >
      {isSelected ? (
        <Badge action="info" className="mb-1 self-start" testID={`${testID}-selected`}>
          <BadgeText>{t('dispatch.active_filter')}</BadgeText>
        </Badge>
      ) : null}
      <HStack className="items-center justify-between">
        <Text className="text-xs font-bold" style={{ color: textColor }}>{`#${call.Number || call.CallId}`}</Text>
        <HStack space="xs" className="items-center">
          <View>
            <Clock size={10} color={textColor} />
          </View>
          <Text className="text-xs" style={{ color: textColor }}>
            {ageText}
          </Text>
        </HStack>
      </HStack>
      <HStack space="xs" className="mt-0.5 items-center">
        <TypeIcon iconUrl={call.TypeIconUrl ?? null} mapIcon={call.TypeMapIcon ?? null} size={18} />
        <Text className="flex-1 text-sm font-bold" style={{ color: textColor }} numberOfLines={1}>
          {call.Name}
        </Text>
        <AlarmLevelBadge alarmLevel={call.AlarmLevel} testID={`${testID}-alarm`} />
      </HStack>
      {call.Address ? (
        <HStack space="xs" className="items-center">
          <View>
            <MapPin size={10} color={textColor} />
          </View>
          <Text className="flex-1 text-xs" style={{ color: textColor }} numberOfLines={1}>
            {call.Address}
          </Text>
        </HStack>
      ) : null}
      {destination ? (
        <HStack space="xs" className="items-center">
          <View>
            <Navigation size={10} color={textColor} />
          </View>
          <Text className="flex-1 text-xs italic" style={{ color: textColor }} numberOfLines={1}>
            {destination}
          </Text>
        </HStack>
      ) : null}
      {nature ? (
        <Text className="text-xs opacity-90" style={{ color: textColor }} numberOfLines={1}>
          {nature}
        </Text>
      ) : null}
      <View style={StyleSheet.flatten([styles.divider, { backgroundColor: textColor }])} />
      <HStack space="xs" className="items-center">
        <View>
          <Radio size={10} color={textColor} />
        </View>
        <View className="flex-1">
          <DispatchTicker dispatches={dispatches} testID={`${testID}-ticker`} />
        </View>
      </HStack>
      {overdueNames.length > 0 ? (
        <View style={styles.overdue} testID={`${testID}-overdue`}>
          <Text className="text-xs font-bold text-typography-0" numberOfLines={1}>
            {t('dispatch_console.overdue_check_ins', { names: overdueNames.join(', ') })}
          </Text>
        </View>
      ) : null}
      <View style={styles.cornerButtons}>
        {onAddResources ? (
          <Pressable onPress={() => onAddResources(call)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('dispatch_console.add_resources')} style={styles.cornerButton} testID={`${testID}-add-resources`}>
            <View>
              <UserPlus size={12} color={textColor} />
            </View>
          </Pressable>
        ) : null}
        <Pressable onPress={() => onOpenDetails(call.CallId)} hitSlop={8} accessibilityRole="link" accessibilityLabel={t('dispatch.view_details')} style={styles.cornerButton} testID={`${testID}-details`}>
          <View>
            <ExternalLink size={12} color={textColor} />
          </View>
        </Pressable>
      </View>
    </Pressable>
  );
});

ConsoleCallCard.displayName = 'ConsoleCallCard';

const styles = StyleSheet.create({
  card: { borderRadius: 8, padding: 8, paddingRight: 56, marginBottom: 6 },
  selected: { borderWidth: 3, borderColor: '#6366f1' },
  divider: { height: StyleSheet.hairlineWidth, opacity: 0.4, marginVertical: 4 },
  overdue: { marginTop: 4, backgroundColor: '#dc2626', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  cornerButtons: { position: 'absolute', top: 6, right: 6, flexDirection: 'row' },
  cornerButton: { marginLeft: 6, padding: 4, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.15)' },
});
