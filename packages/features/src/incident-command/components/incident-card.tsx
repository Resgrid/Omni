import { formatUtcInDepartmentTime, parseUtcMs } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { IncidentCommandStatus, type IncidentCommandSummary } from '@resgrid/models';
import { Badge, BadgeText, HStack, Pressable, Text, VStack } from '@resgrid/ui';
import { MapPin, Truck, User } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

/** Whole minutes between establishment and close (or now), `Xh Ym`; null when unknown. */
export function formatIncidentDuration(summary: Pick<IncidentCommandSummary, 'EstablishedOn' | 'ClosedOn'>, nowMs: number): string | null {
  const start = parseUtcMs(summary.EstablishedOn);
  if (start === null) return null;
  const end = parseUtcMs(summary.ClosedOn) ?? nowMs;
  const minutes = Math.max(0, Math.floor((end - start) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export interface IncidentCardProps {
  summary: IncidentCommandSummary;
  nowMs: number;
  /** This device tracks the board (it opens straight away, offline too). */
  isTracked: boolean;
  onPress: (summary: IncidentCommandSummary) => void;
}

/** One incident in IC's list (IC incident-card): name, call, address, commander, resources and duration. */
export const IncidentCard: React.FC<IncidentCardProps> = ({ summary, nowMs, isTracked, onPress }) => {
  const { t } = useTranslation();
  const isActive = summary.Status === IncidentCommandStatus.Active;
  const title = summary.Name || summary.CallName || t('incident_command.call_number', { number: summary.CallNumber || String(summary.CallId) });
  const duration = formatIncidentDuration(summary, nowMs);
  return (
    <Pressable
      onPress={() => onPress(summary)}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="mb-2 rounded-xl border border-outline-100 bg-background-0 p-3"
      testID={`incident-card-${summary.IncidentCommandId}`}
    >
      <HStack className="items-start justify-between" space="sm">
        <VStack className="min-w-0 flex-1">
          <Text className="font-semibold text-typography-900" numberOfLines={1}>
            {title}
          </Text>
          {summary.CallNumber ? <Text className="text-xs text-typography-500">{t('incident_command.call_number', { number: summary.CallNumber })}</Text> : null}
        </VStack>
        <HStack space="xs">
          {isTracked ? (
            <Badge action="info" size="sm">
              <BadgeText>{t('incident_command.on_this_device')}</BadgeText>
            </Badge>
          ) : null}
          <Badge action={isActive ? 'success' : 'muted'} size="sm">
            <BadgeText>{isActive ? t('incident_command.status_active') : t('incident_command.status_closed')}</BadgeText>
          </Badge>
        </HStack>
      </HStack>
      {summary.CallAddress ? (
        <HStack className="mt-1 items-center" space="xs">
          <View>
            <MapPin size={14} color="#6b7280" />
          </View>
          <Text className="min-w-0 flex-1 text-sm text-typography-700" numberOfLines={1}>
            {summary.CallAddress}
          </Text>
        </HStack>
      ) : null}
      <HStack className="mt-1 flex-wrap items-center" space="md">
        {summary.CommanderName ? (
          <HStack className="items-center" space="xs">
            <View>
              <User size={14} color="#6b7280" />
            </View>
            <Text className="text-xs text-typography-600">{summary.CommanderName}</Text>
          </HStack>
        ) : null}
        <HStack className="items-center" space="xs">
          <View>
            <Truck size={14} color="#6b7280" />
          </View>
          <Text className="text-xs text-typography-600">{t('incident_command.resource_counts', { units: summary.AssignedUnitCount ?? 0, personnel: summary.AssignedPersonnelCount ?? 0 })}</Text>
        </HStack>
        <Text className="text-xs text-typography-500">
          {duration ? t('incident_command.established_duration', { time: formatUtcInDepartmentTime(summary.EstablishedOn, null), duration }) : formatUtcInDepartmentTime(summary.EstablishedOn, null)}
        </Text>
      </HStack>
    </Pressable>
  );
};
