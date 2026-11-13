import { personnelFullName } from '@resgrid/data';
import { UnitNavigationEtaChip } from '@resgrid/features/navigation-eta';
import { alertColors, type UnitAlertAcknowledgementState, UnitAlertBadge, type UnitStatusAlertLevel } from '@resgrid/features/unit-status-alerts';
import { useTranslation } from '@resgrid/i18n';
import type { PersonnelInfoResultData, UnitInfoResultData } from '@resgrid/models';
import { Badge, BadgeText, contentOnFill, HStack, Pressable, Text, TypeIcon, useReadableColor, useThemeColors, VStack } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import { AlertTriangle, Circle, ExternalLink, MapPin, Plus, Square, SquareCheck, Truck, User, Users } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { type GestureResponderEvent, Platform, StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { getUnitCrew } from '../lib/console-filters';

const modifierFlagsSchema = z.object({ ctrlKey: z.boolean().optional(), metaKey: z.boolean().optional(), shiftKey: z.boolean().optional() });

/** A press on web: react-native-web puts the modifier flags on the press event or on its DOM event. */
const webPressSchema = modifierFlagsSchema.extend({ nativeEvent: modifierFlagsSchema.optional() });

/** The selection a modified click asks for on web: Ctrl/Cmd adds one unit, Shift adds a range. */
export interface PressModifiers {
  isMultiSelect: boolean;
  isRangeSelect: boolean;
}

export type WebPressFlags = z.infer<typeof webPressSchema>;

const NO_MODIFIERS: PressModifiers = { isMultiSelect: false, isRangeSelect: false };

export const toPressModifiers = ({ ctrlKey, metaKey, shiftKey, nativeEvent }: WebPressFlags): PressModifiers => ({
  isMultiSelect: !!(ctrlKey || metaKey || nativeEvent?.ctrlKey || nativeEvent?.metaKey),
  isRangeSelect: !!(shiftKey || nativeEvent?.shiftKey),
});

/** The modifier keys held during a press, as in a desktop list; none on native or for a press without them. */
export const readPressModifiers = (event?: GestureResponderEvent): PressModifiers => {
  if (Platform.OS !== 'web' || !event) return NO_MODIFIERS;
  const parsed = webPressSchema.safeParse(event);

  return parsed.success ? toPressModifiers(parsed.data) : NO_MODIFIERS;
};

/** Dispatch's row card: indigo border when selected, washed in indigo while it is in a multi-unit selection. */
const rowTone = (isSelected: boolean, isSelectionMode: boolean): string =>
  isSelected ? (isSelectionMode ? 'border-primary-500 bg-primary-50' : 'border-primary-500 bg-background-50') : 'border-outline-200 bg-background-50';

/** A department status as a dot and its name, both adjusted to read on the theme's surface. */
const StatusLine: React.FC<{ text: string; color: string | null | undefined; testID: string }> = ({ text, color, testID }) => {
  const readable = useReadableColor();
  const mark = readable.mark(color);

  return (
    <HStack space="xs" className="items-center" testID={testID}>
      <View>
        <Circle size={8} color={mark} fill={mark} />
      </View>
      <Text className="text-xs font-medium" style={{ color: readable.text(color) }} numberOfLines={1}>
        {text}
      </Text>
    </HStack>
  );
};

/** A small square button beside a row (details, set status for the call): never inside the row's own button. */
const RowIconButton: React.FC<{ icon: LucideIcon; tone: 'neutral' | 'accent'; onPress: () => void; accessibilityLabel: string; testID: string }> = ({ icon: Icon, tone, onPress, accessibilityLabel, testID }) => {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={StyleSheet.flatten([styles.iconButton, tone === 'accent' ? styles.accentButton : styles.neutralButton])}
      testID={testID}
    >
      <View>
        <Icon size={12} color={tone === 'accent' ? colors.token('primary-500') : colors.token('typography-500')} />
      </View>
    </Pressable>
  );
};

/** "3/4" role seats and who is on them; green when every seat is filled, amber when some are. */
export const UnitCrewLine: React.FC<{ unit: Pick<UnitInfoResultData, 'UnitId' | 'Roles'> }> = React.memo(({ unit }) => {
  const colors = useThemeColors();
  const crew = useMemo(() => getUnitCrew(unit), [unit]);

  if (crew.total === 0) return null;
  const countClass = crew.filled === crew.total ? 'text-success-600' : crew.filled > 0 ? 'text-warning-600' : 'text-typography-500';

  return (
    <HStack space="xs" className="mt-0.5 items-center" testID={`unit-crew-${unit.UnitId}`}>
      <View>
        <Users size={10} color={colors.token('typography-400')} />
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

/** Where a unit or member is headed (status destination), in Dispatch's amber. */
const DestinationLine: React.FC<{ name: string }> = ({ name }) => {
  const colors = useThemeColors();

  return (
    <HStack space="xs" className="mt-0.5 items-center">
      <View>
        <MapPin size={10} color={colors.token('warning-500')} />
      </View>
      <Text className="flex-1 text-xs font-medium text-warning-600" numberOfLines={1}>
        {name}
      </Text>
    </HStack>
  );
};

/**
 * A unit's transport status going somewhere other than its call's assigned destination (transport destination checks): the
 * call's destination in red, so the dispatcher can confirm the change by radio.
 */
const CallDestinationMismatchLine: React.FC<{ name: string; testID: string }> = ({ name, testID }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <HStack space="xs" className="mt-0.5 items-center" testID={testID}>
      <View>
        <AlertTriangle size={10} color={colors.token('error-500')} />
      </View>
      <Text className="flex-1 text-xs font-medium text-error-600" numberOfLines={1}>
        {t('status.call_assigned_destination', { name })}
      </Text>
    </HStack>
  );
};

const PendingSyncBadge: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Badge action="warning" size="sm">
      <BadgeText>{t('dispatch_console.pending_sync')}</BadgeText>
    </Badge>
  );
};

export interface ConsoleUnitRowProps {
  unit: UnitInfoResultData;
  isSelected: boolean;
  isOnCall: boolean;
  isSelectionMode: boolean;
  hasPendingStatus?: boolean;
  onPress: (unitId: string, event?: GestureResponderEvent) => void;
  onLongPress: (unitId: string) => void;
  /** Opens the unit's detail screen. */
  onOpen?: (unitId: string) => void;
  /** "+": set this unit's status with the filtered call as destination. */
  onSetStatusForCall?: (unitId: string) => void;
  /** The unit's status timer while it is over it (primitives, so a row re-renders only when its own timer moves). */
  timerLevel?: UnitStatusAlertLevel;
  timerAcknowledgement?: UnitAlertAcknowledgementState;
  timerSeconds?: number | null;
  /** The call's assigned destination when the unit's transport status goes elsewhere (`unitTransportDestinationMismatch`). */
  callDestinationMismatch?: string | null;
}

/**
 * A unit on the console (Dispatch's row): its type icon on a tile in the status colour, name, type · group, crew seats,
 * destination, its live ETA while it navigates in the Unit app, and its status as a dot and name with a GPS marker. A
 * unit over its status timer gets the timer's edge colour and badge (until someone mutes it): the cue to contact it.
 */
export const ConsoleUnitRow: React.FC<ConsoleUnitRowProps> = React.memo(
  ({
    unit,
    isSelected,
    isOnCall,
    isSelectionMode,
    hasPendingStatus = false,
    onPress,
    onLongPress,
    onOpen,
    onSetStatusForCall,
    timerLevel = 'none',
    timerAcknowledgement = 'none',
    timerSeconds = null,
    callDestinationMismatch = null,
  }) => {
    const { t } = useTranslation();
    const colors = useThemeColors();
    const readable = useReadableColor();
    const tileColor = readable.mark(unit.CurrentStatusColor);

    const subtitle = [unit.Type, unit.GroupName].flatMap((part) => (part?.trim() ? [part.trim()] : [])).join(' · ') || t('dispatch.unassigned');

    const hasPosition = !!unit.Latitude && !!unit.Longitude;
    // A muted alert keeps its badge but gives up the edge: someone already dealt with it.
    const timerEdge = timerAcknowledgement === 'muted' ? undefined : alertColors(timerLevel, false).edge;

    return (
      <HStack className={`mb-2 items-center rounded-lg border ${rowTone(isSelected, isSelectionMode)}`} style={timerEdge ? StyleSheet.flatten([styles.timerEdge, { borderLeftColor: timerEdge }]) : undefined}>
        <Pressable
          onPress={(event?: GestureResponderEvent) => onPress(unit.UnitId, event)}
          onLongPress={() => onLongPress(unit.UnitId)}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          // No text selection on web: a Shift-click would otherwise highlight the rows' text instead of only selecting units.
          className="flex-1 rounded-lg p-2 web:select-none"
          testID={`console-unit-${unit.UnitId}`}
        >
          <HStack space="sm" className="items-center">
            {isSelectionMode ? <View>{isSelected ? <SquareCheck size={16} color={colors.token('primary-600')} /> : <Square size={16} color={colors.token('typography-400')} />}</View> : null}
            <View style={StyleSheet.flatten([styles.unitTile, { backgroundColor: tileColor }])}>
              <TypeIcon iconUrl={unit.TypeIconUrl ?? null} mapIcon={unit.TypeMapIcon ?? null} size={22} containerStyle={styles.typeIconBackdrop} fallback={<Truck size={14} color={contentOnFill(tileColor)} />} />
            </View>
            <VStack className="flex-1">
              <HStack space="xs" className="items-center">
                <Text className="shrink text-sm font-semibold text-typography-800" numberOfLines={1}>
                  {unit.Name}
                </Text>
                {isOnCall ? (
                  <View className="rounded bg-info-50 px-1.5 py-0.5" testID={`console-unit-${unit.UnitId}-on-call`}>
                    <Text className="text-xs text-info-700">{t('dispatch.on_call')}</Text>
                  </View>
                ) : null}
                {hasPendingStatus ? <PendingSyncBadge /> : null}
              </HStack>
              <Text className="text-xs text-typography-500" numberOfLines={1}>
                {subtitle}
              </Text>
              <UnitCrewLine unit={unit} />
              {unit.CurrentDestinationName?.trim() ? <DestinationLine name={unit.CurrentDestinationName} /> : null}
              {callDestinationMismatch ? <CallDestinationMismatchLine name={callDestinationMismatch} testID={`console-unit-${unit.UnitId}-destination-mismatch`} /> : null}
              <UnitNavigationEtaChip unitId={unit.UnitId} testID={`console-unit-${unit.UnitId}-eta`} />
            </VStack>
            <VStack space="xs" className="max-w-[140px] items-end">
              <StatusLine text={unit.CurrentStatus || t('common.unknown')} color={unit.CurrentStatusColor} testID={`console-unit-${unit.UnitId}-status`} />
              <UnitAlertBadge level={timerLevel} acknowledgementState={timerAcknowledgement} secondsInStatus={timerSeconds} testID={`console-unit-${unit.UnitId}-timer`} />
              {hasPosition ? (
                <HStack space="xs" className="items-center">
                  <View>
                    <MapPin size={10} color={colors.token('typography-400')} />
                  </View>
                  <Text className="text-xs text-typography-400">{t('dispatch_console.gps')}</Text>
                </HStack>
              ) : null}
            </VStack>
          </HStack>
        </Pressable>
        {onOpen || onSetStatusForCall ? (
          <VStack space="xs" className="items-center pr-2">
            {onOpen ? <RowIconButton icon={ExternalLink} tone="neutral" onPress={() => onOpen(unit.UnitId)} accessibilityLabel={t('dispatch.view_details')} testID={`console-unit-${unit.UnitId}-open`} /> : null}
            {onSetStatusForCall ? (
              <RowIconButton
                icon={Plus}
                tone="accent"
                onPress={() => onSetStatusForCall(unit.UnitId)}
                accessibilityLabel={t('dispatch_console.set_status_for_call')}
                testID={`console-unit-${unit.UnitId}-status-for-call`}
              />
            ) : null}
          </VStack>
        ) : null}
      </HStack>
    );
  }
);

ConsoleUnitRow.displayName = 'ConsoleUnitRow';

export interface ConsolePersonnelRowProps {
  person: PersonnelInfoResultData;
  isSelected: boolean;
  isOnCall: boolean;
  hasPendingStatus?: boolean;
  onPress: (userId: string) => void;
  /** Opens the member's detail screen. */
  onOpen?: (userId: string) => void;
  onSetStatusForCall?: (userId: string) => void;
}

/**
 * A member on the console (Dispatch's row): their role icon in a ring of their status colour, name, group, roles, status
 * destination, and status and staffing as dots with their names.
 */
export const ConsolePersonnelRow: React.FC<ConsolePersonnelRowProps> = React.memo(({ person, isSelected, isOnCall, hasPendingStatus = false, onPress, onOpen, onSetStatusForCall }) => {
  const { t } = useTranslation();
  const readable = useReadableColor();
  const name = personnelFullName(person) || person.UserId;
  const ringColor = readable.mark(person.StatusColor);
  const staffingColor = readable.mark(person.StaffingColor);
  const roles = (person.Roles ?? []).join(', ');

  return (
    <HStack className={`mb-2 items-center rounded-lg border ${rowTone(isSelected, false)}`}>
      <Pressable onPress={() => onPress(person.UserId)} accessibilityRole="button" accessibilityState={{ selected: isSelected }} className="flex-1 rounded-lg p-2" testID={`console-person-${person.UserId}`}>
        <HStack space="sm" className="items-center">
          <View style={StyleSheet.flatten([styles.avatar, { borderColor: ringColor }])}>
            <TypeIcon iconUrl={person.RoleIconUrl ?? null} size={20} fallback={<User size={16} color={ringColor} />} />
          </View>
          <VStack className="flex-1">
            <HStack space="xs" className="items-center">
              <Text className="shrink text-sm font-semibold text-typography-800" numberOfLines={1}>
                {name}
              </Text>
              {isOnCall ? (
                <View className="rounded bg-purple-100 px-1.5 py-0.5 dark:bg-purple-900" testID={`console-person-${person.UserId}-on-call`}>
                  <Text className="text-xs text-purple-700 dark:text-purple-300">{t('dispatch.on_call')}</Text>
                </View>
              ) : null}
              {hasPendingStatus ? <PendingSyncBadge /> : null}
            </HStack>
            <Text className="text-xs text-typography-500" numberOfLines={1}>
              {person.GroupName || t('dispatch.unassigned')}
            </Text>
            {roles ? (
              <Text className="text-xs text-primary-500" numberOfLines={1}>
                {roles}
              </Text>
            ) : null}
            {person.StatusDestinationName?.trim() ? <DestinationLine name={person.StatusDestinationName} /> : null}
          </VStack>
          <VStack space="xs" className="max-w-[140px] items-end">
            <StatusLine text={person.Status || t('common.unknown')} color={person.StatusColor} testID={`console-person-${person.UserId}-status`} />
            <HStack space="xs" className="items-center">
              <View>
                <Circle size={6} color={staffingColor} fill={staffingColor} />
              </View>
              <Text className="text-xs text-typography-500" numberOfLines={1}>
                {person.Staffing || t('common.unknown')}
              </Text>
            </HStack>
          </VStack>
        </HStack>
      </Pressable>
      {onOpen || onSetStatusForCall ? (
        <VStack space="xs" className="items-center pr-2">
          {onOpen ? <RowIconButton icon={ExternalLink} tone="neutral" onPress={() => onOpen(person.UserId)} accessibilityLabel={t('dispatch.view_details')} testID={`console-person-${person.UserId}-open`} /> : null}
          {onSetStatusForCall ? (
            <RowIconButton
              icon={Plus}
              tone="accent"
              onPress={() => onSetStatusForCall(person.UserId)}
              accessibilityLabel={t('dispatch_console.set_status_for_call')}
              testID={`console-person-${person.UserId}-status-for-call`}
            />
          ) : null}
        </VStack>
      ) : null}
    </HStack>
  );
});

ConsolePersonnelRow.displayName = 'ConsolePersonnelRow';

const styles = StyleSheet.create({
  timerEdge: { borderLeftWidth: 4 },
  unitTile: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  // A light tile behind a unit-type icon so it reads on any status colour, which stays visible as the frame.
  typeIconBackdrop: { backgroundColor: '#ffffff', borderRadius: 4 },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139, 92, 246, 0.1)' },
  iconButton: { padding: 4, borderRadius: 4 },
  neutralButton: { backgroundColor: 'rgba(107, 114, 128, 0.1)' },
  accentButton: { backgroundColor: 'rgba(99, 102, 241, 0.12)' },
});
