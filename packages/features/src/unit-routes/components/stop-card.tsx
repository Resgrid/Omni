import { useTranslation } from '@resgrid/i18n';
import type { RouteStopWithDetailsResultData } from '@resgrid/models';
import { HStack, Pressable, Text, View, VStack } from '@resgrid/ui';
import { Circle, CircleCheck, Clock, LogIn, LogOut, type LucideIcon, MapPin, SkipForward, User } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { formatRouteTime } from '../lib/route-format';
import { type StopActionKind, stopActions, stopStatusLook } from '../lib/route-status';

const STATUS_ICONS: Readonly<Record<number, LucideIcon>> = { 0: Circle, 1: Clock, 2: CircleCheck, 3: SkipForward };

const ACTIONS: Readonly<Record<StopActionKind, { labelKey: string; icon: LucideIcon; className: string; textClassName: string; iconColor: string }>> = {
  checkIn: { labelKey: 'routes.check_in', icon: LogIn, className: 'bg-primary-600', textClassName: 'text-typography-0', iconColor: '#ffffff' },
  checkOut: { labelKey: 'routes.check_out', icon: LogOut, className: 'bg-success-600', textClassName: 'text-typography-0', iconColor: '#ffffff' },
  skip: { labelKey: 'routes.skip', icon: SkipForward, className: 'border border-warning-500 bg-background-0', textClassName: 'text-warning-700', iconColor: '#ca8a04' },
};

export interface StopCardProps {
  stop: RouteStopWithDetailsResultData;
  /** The stop the crew works next: highlighted, with its actions. */
  isCurrent?: boolean;
  onAction?: (kind: StopActionKind, stop: RouteStopWithDetailsResultData) => void;
  onPress?: (stop: RouteStopWithDetailsResultData) => void;
  /** A write for this stop is in flight. */
  isBusy?: boolean;
  /** Touch-target height of the actions (MDT: 64). */
  actionMinHeight?: number;
  testID?: string;
}

/**
 * A route stop (Unit stop card, fed from `GetStopsForInstance` so names and addresses are present — Unit read them from
 * the progress rows, which carry neither): order, status, address, contact, planned arrival and, on the current stop,
 * check in / check out / skip.
 */
export const StopCard: React.FC<StopCardProps> = React.memo(({ stop, isCurrent = false, onAction, onPress, isBusy = false, actionMinHeight = 48, testID }) => {
  const { t } = useTranslation();
  const id = stop.RouteInstanceStopId ?? stop.RouteStopId;
  const cardTestId = testID ?? `stop-card-${id}`;
  const look = stopStatusLook(stop.Status);
  const Icon = STATUS_ICONS[stop.Status] ?? Circle;
  const actions = isCurrent && onAction ? stopActions(stop) : [];
  const planned = formatRouteTime(stop.EstimatedArrivalOn ?? stop.PlannedArrivalTime);

  return (
    <View className={`mb-2 rounded-xl p-4 ${isCurrent ? 'border-2 border-primary-500 bg-primary-50' : 'bg-background-0'}`} testID={cardTestId}>
      <Pressable onPress={onPress ? () => onPress(stop) : undefined} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} testID={`${cardTestId}-open`}>
        <HStack space="md" className="items-start">
          <View style={StyleSheet.flatten([styles.statusIcon, { backgroundColor: `${look.color}33` }])}>
            <Icon size={16} color={look.color} />
          </View>
          <VStack className="flex-1" space="xs">
            <HStack space="sm" className="flex-wrap items-center">
              <Text className="text-base font-semibold text-typography-900">{stop.Name}</Text>
              <View style={StyleSheet.flatten([styles.badge, { backgroundColor: `${look.color}33` }])}>
                <Text className="text-xs font-semibold" style={{ color: look.color }} testID={`${cardTestId}-status`}>
                  {t(look.labelKey)}
                </Text>
              </View>
            </HStack>
            {stop.Address ? (
              <HStack space="xs" className="items-center">
                <View>
                  <MapPin size={12} color="#9ca3af" />
                </View>
                <Text className="flex-1 text-sm text-typography-600" numberOfLines={1}>
                  {stop.Address}
                </Text>
              </HStack>
            ) : null}
            {stop.ContactId || stop.ContactName ? (
              <HStack space="xs" className="items-center">
                <View>
                  <User size={12} color="#9ca3af" />
                </View>
                <Text className="text-sm text-primary-600">{stop.ContactName || t('routes.contact')}</Text>
              </HStack>
            ) : null}
            {planned ? <Text className="text-xs text-typography-500">{`${t('routes.eta')}: ${planned}`}</Text> : null}
          </VStack>
          <Text className="text-lg font-bold text-typography-300">{`#${stop.StopOrder}`}</Text>
        </HStack>
      </Pressable>
      {actions.length > 0 ? (
        <HStack space="sm" className="mt-3">
          {actions.map((kind) => {
            const action = ACTIONS[kind];
            const ActionIcon = action.icon;
            return (
              <Pressable
                key={kind}
                onPress={() => onAction?.(kind, stop)}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel={t(action.labelKey)}
                accessibilityState={{ disabled: isBusy }}
                testID={`${cardTestId}-${kind}`}
                className={`flex-1 flex-row items-center justify-center rounded-lg px-3 ${action.className}`}
                style={StyleSheet.flatten([{ minHeight: actionMinHeight }, isBusy ? styles.busy : null])}
              >
                <View style={styles.actionIcon}>
                  <ActionIcon size={16} color={action.iconColor} />
                </View>
                <Text className={`font-semibold ${action.textClassName}`}>{t(action.labelKey)}</Text>
              </Pressable>
            );
          })}
        </HStack>
      ) : null}
    </View>
  );
});

StopCard.displayName = 'StopCard';

const styles = StyleSheet.create({
  statusIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  actionIcon: { marginRight: 6 },
  busy: { opacity: 0.5 },
});
