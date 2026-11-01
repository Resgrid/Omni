import { personnelFullName } from '@resgrid/data';
import { readableColors } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import type { PersonnelInfoResultData, UnitInfoResultData } from '@resgrid/models';
import { Badge, BadgeText, HStack, Pressable, Text, TypeIcon, VStack } from '@resgrid/ui';
import { Circle, MapPin, Plus, Square, SquareCheck, Truck, User, Users } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { type GestureResponderEvent, Platform, StyleSheet, View } from 'react-native';

import { getUnitCrew } from '../lib/console-filters';

/** Ctrl/Cmd-click on web adds a unit to a multi-unit selection, as in a desktop list. */
export const isMultiSelectClick = (event?: GestureResponderEvent): boolean => {
  if (Platform.OS !== 'web' || !event) return false;
  const pressEvent = event as unknown as { ctrlKey?: boolean; metaKey?: boolean; nativeEvent?: { ctrlKey?: boolean; metaKey?: boolean } };
  return !!(pressEvent.ctrlKey || pressEvent.metaKey || pressEvent.nativeEvent?.ctrlKey || pressEvent.nativeEvent?.metaKey);
};

const StatusPill: React.FC<{ text: string | null | undefined; color: string | null | undefined; testID: string }> = ({ text, color, testID }) => {
  const { t } = useTranslation();
  const colors = readableColors(color, '#9ca3af');
  return (
    <View style={StyleSheet.flatten([styles.pill, { backgroundColor: colors.backgroundColor }])} testID={testID}>
      <Text className="text-xs font-semibold" style={{ color: colors.textColor }} numberOfLines={1}>
        {text || t('common.unknown')}
      </Text>
    </View>
  );
};

/** "3/4" role seats and who is on them; green when every seat is filled, amber when some are. */
export const UnitCrewLine: React.FC<{ unit: Pick<UnitInfoResultData, 'UnitId' | 'Roles'> }> = React.memo(({ unit }) => {
  const crew = useMemo(() => getUnitCrew(unit), [unit]);
  if (crew.total === 0) return null;
  const countClass = crew.filled === crew.total ? 'text-success-600' : crew.filled > 0 ? 'text-warning-600' : 'text-typography-500';
  return (
    <HStack space="xs" className="mt-0.5 items-center" testID={`unit-crew-${unit.UnitId}`}>
      <View>
        <Users size={10} color="#9ca3af" />
      </View>
      <Text className={`text-xs font-semibold ${countClass}`}>{`${crew.filled}/${crew.total}`}</Text>
      {crew.names.length > 0 ? (
        <Text className="flex-1 text-xs text-typography-600" numberOfLines={2}>
          {crew.names.join(', ')}
        </Text>
      ) : null}
    </HStack>
  );
});

UnitCrewLine.displayName = 'UnitCrewLine';

export interface ConsoleUnitRowProps {
  unit: UnitInfoResultData;
  isSelected: boolean;
  isOnCall: boolean;
  isSelectionMode: boolean;
  hasPendingStatus?: boolean;
  onPress: (unitId: string, event?: GestureResponderEvent) => void;
  onLongPress: (unitId: string) => void;
  /** "+": set this unit's status with the filtered call as destination. */
  onSetStatusForCall?: (unitId: string) => void;
}

/** A unit on the console: type icon, name, type · group, crew seats, destination and its status in the department colour. */
export const ConsoleUnitRow: React.FC<ConsoleUnitRowProps> = React.memo(({ unit, isSelected, isOnCall, isSelectionMode, hasPendingStatus = false, onPress, onLongPress, onSetStatusForCall }) => {
  const { t } = useTranslation();
  const subtitle = [unit.Type, unit.GroupName]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={(event?: GestureResponderEvent) => onPress(unit.UnitId, event)}
      onLongPress={() => onLongPress(unit.UnitId)}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className={`mb-1.5 rounded-lg border p-2 ${isSelected ? 'border-primary-500 bg-primary-50' : isOnCall ? 'border-info-300 bg-background-info' : 'border-outline-100 bg-background-0'}`}
      testID={`console-unit-${unit.UnitId}`}
    >
      <HStack space="sm" className="items-center">
        {isSelectionMode ? <View>{isSelected ? <SquareCheck size={16} color="#4f46e5" /> : <Square size={16} color="#9ca3af" />}</View> : null}
        <TypeIcon iconUrl={unit.TypeIconUrl ?? null} mapIcon={unit.TypeMapIcon ?? null} size={22} fallback={<Truck size={18} color="#6b7280" />} />
        <VStack className="flex-1">
          <HStack space="xs" className="items-center">
            <Text className="flex-1 text-sm font-semibold" numberOfLines={1}>
              {unit.Name}
            </Text>
            {hasPendingStatus ? (
              <Badge action="warning" size="sm">
                <BadgeText>{t('dispatch_console.pending_sync')}</BadgeText>
              </Badge>
            ) : null}
          </HStack>
          {subtitle ? (
            <Text className="text-xs text-typography-500" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          <UnitCrewLine unit={unit} />
          {unit.CurrentDestinationName?.trim() ? (
            <HStack space="xs" className="items-center">
              <View>
                <MapPin size={10} color="#6b7280" />
              </View>
              <Text className="flex-1 text-xs text-typography-500" numberOfLines={1}>
                {unit.CurrentDestinationName}
              </Text>
            </HStack>
          ) : null}
        </VStack>
        <VStack space="xs" className="items-end">
          <StatusPill text={unit.CurrentStatus} color={unit.CurrentStatusColor} testID={`console-unit-${unit.UnitId}-status`} />
          {onSetStatusForCall ? (
            <Pressable
              onPress={() => onSetStatusForCall(unit.UnitId)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('dispatch_console.set_status_for_call')}
              className="rounded bg-primary-50 p-1"
              testID={`console-unit-${unit.UnitId}-status-for-call`}
            >
              <View>
                <Plus size={12} color="#6366f1" />
              </View>
            </Pressable>
          ) : null}
        </VStack>
      </HStack>
    </Pressable>
  );
});

ConsoleUnitRow.displayName = 'ConsoleUnitRow';

export interface ConsolePersonnelRowProps {
  person: PersonnelInfoResultData;
  isSelected: boolean;
  isOnCall: boolean;
  hasPendingStatus?: boolean;
  onPress: (userId: string) => void;
  onSetStatusForCall?: (userId: string) => void;
}

/** A member on the console: name, group, roles, status and staffing in the department colours, and the status destination. */
export const ConsolePersonnelRow: React.FC<ConsolePersonnelRowProps> = React.memo(({ person, isSelected, isOnCall, hasPendingStatus = false, onPress, onSetStatusForCall }) => {
  const { t } = useTranslation();
  const name = personnelFullName(person) || person.UserId;
  return (
    <Pressable
      onPress={() => onPress(person.UserId)}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className={`mb-1.5 rounded-lg border p-2 ${isSelected ? 'border-primary-500 bg-primary-50' : isOnCall ? 'border-info-300 bg-background-info' : 'border-outline-100 bg-background-0'}`}
      testID={`console-person-${person.UserId}`}
    >
      <HStack space="sm" className="items-center">
        {person.RoleIconUrl ? <TypeIcon iconUrl={person.RoleIconUrl} size={22} /> : <User size={18} color="#6b7280" />}
        <VStack className="flex-1">
          <HStack space="xs" className="items-center">
            <Text className="flex-1 text-sm font-semibold" numberOfLines={1}>
              {name}
            </Text>
            {hasPendingStatus ? (
              <Badge action="warning" size="sm">
                <BadgeText>{t('dispatch_console.pending_sync')}</BadgeText>
              </Badge>
            ) : null}
          </HStack>
          {person.GroupName || (person.Roles ?? []).length > 0 ? (
            <Text className="text-xs text-typography-500" numberOfLines={1}>
              {[person.GroupName, (person.Roles ?? []).join(', ')].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {person.StatusDestinationName ? (
            <HStack space="xs" className="items-center">
              <View>
                <MapPin size={10} color="#6b7280" />
              </View>
              <Text className="flex-1 text-xs text-typography-500" numberOfLines={1}>
                {person.StatusDestinationName}
              </Text>
            </HStack>
          ) : null}
        </VStack>
        <VStack space="xs" className="items-end">
          <StatusPill text={person.Status} color={person.StatusColor} testID={`console-person-${person.UserId}-status`} />
          {person.Staffing ? (
            <HStack space="xs" className="items-center">
              <View>
                <Circle size={8} color={person.StaffingColor || '#9ca3af'} fill={person.StaffingColor || '#9ca3af'} />
              </View>
              <Text className="text-xs text-typography-500" numberOfLines={1}>
                {person.Staffing}
              </Text>
            </HStack>
          ) : null}
          {onSetStatusForCall ? (
            <Pressable
              onPress={() => onSetStatusForCall(person.UserId)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('dispatch_console.set_status_for_call')}
              className="rounded bg-primary-50 p-1"
              testID={`console-person-${person.UserId}-status-for-call`}
            >
              <View>
                <Plus size={12} color="#6366f1" />
              </View>
            </Pressable>
          ) : null}
        </VStack>
      </HStack>
    </Pressable>
  );
});

ConsolePersonnelRow.displayName = 'ConsolePersonnelRow';

const styles = StyleSheet.create({
  pill: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, maxWidth: 140 },
});
