import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import type { IncidentCommand } from '@resgrid/models';
import { Badge, BadgeText, Heading, HStack, Text, VStack } from '@resgrid/ui';
import { CloudOff, Info, Map, RefreshCw, ScrollText, Sparkles, UserCog, XCircle } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useNow } from '../hooks/use-now';
import { sceneElapsed } from '../lib/board';
import { BoardButton } from './board-buttons';

export interface CommandHeaderProps {
  title: string;
  subtitle?: string | null;
  command: IncidentCommand | null;
  commanderName?: string | null;
  isProvisional: boolean;
  isClosed: boolean;
  isOnline: boolean;
  /** Full labels on roomy layouts (tablet, desktop); icon-only buttons on phones. */
  roomy: boolean;
  onRefresh: () => void;
  onDetails?: () => void;
  onTransfer?: () => void;
  onEnd?: () => void;
  onAssistant?: () => void;
  onOpenLog?: () => void;
  onOpenMap?: () => void;
  extraActions?: React.ReactNode;
}

/** Board header (IC command screen top card): incident, commander, scene clock, status, important info and actions. */
export const CommandHeader: React.FC<CommandHeaderProps> = ({
  title,
  subtitle,
  command,
  commanderName,
  isProvisional,
  isClosed,
  isOnline,
  roomy,
  onRefresh,
  onDetails,
  onTransfer,
  onEnd,
  onAssistant,
  onOpenLog,
  onOpenMap,
  extraActions,
}) => {
  const { t } = useTranslation();
  const nowMs = useNow(30_000, !isClosed && !!command?.EstablishedOn);
  const elapsed = isClosed ? null : sceneElapsed(command?.EstablishedOn, nowMs);
  const iconOnly = !roomy;

  return (
    <View style={styles.card} className="rounded-xl border border-outline-100 bg-background-0" testID="command-header">
      <HStack className="flex-wrap items-start justify-between" space="sm">
        <VStack className="min-w-0 flex-1">
          <Heading size="md" numberOfLines={1}>
            {title}
          </Heading>
          {subtitle ? (
            <Text className="text-sm text-typography-600" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          <HStack className="mt-1 flex-wrap items-center" space="xs">
            {isClosed ? (
              <Badge action="muted" size="sm" testID="command-header-closed">
                <BadgeText>{t('incident_command.status_closed')}</BadgeText>
              </Badge>
            ) : (
              <Badge action="success" size="sm">
                <BadgeText>{t('incident_command.status_active')}</BadgeText>
              </Badge>
            )}
            {isProvisional ? (
              <Badge action="warning" size="sm" testID="command-header-provisional">
                <BadgeText>{t('incident_command.provisional')}</BadgeText>
              </Badge>
            ) : null}
            {isOnline ? null : (
              <HStack className="items-center" space="xs" testID="command-header-offline">
                <View>
                  <CloudOff size={14} color="#f59e0b" />
                </View>
                <Text className="text-xs text-warning-700">{t('incident_command.offline')}</Text>
              </HStack>
            )}
            {elapsed ? (
              <Text className="text-xs text-typography-500" testID="command-header-clock">
                {t('incident_command.scene_time', { time: elapsed })}
              </Text>
            ) : null}
          </HStack>
          {commanderName ? <Text className="mt-1 text-xs text-typography-600">{t('incident_command.commander_name', { name: commanderName })}</Text> : null}
          {command?.EstimatedEndOn ? <Text className="text-xs text-typography-600">{t('incident_command.estimated_end_at', { time: formatUtcInDepartmentTime(command.EstimatedEndOn, null) })}</Text> : null}
        </VStack>
        <HStack className="flex-wrap items-center" space="xs">
          <BoardButton label={t('incident_command.refresh')} icon={RefreshCw} iconOnly onPress={onRefresh} testID="command-refresh" />
          {onOpenMap ? <BoardButton label={t('incident_command.command_map')} icon={Map} iconOnly={iconOnly} onPress={onOpenMap} testID="command-open-map" /> : null}
          {onOpenLog ? <BoardButton label={t('incident_command.log')} icon={ScrollText} iconOnly={iconOnly} onPress={onOpenLog} testID="command-open-log" /> : null}
          {onAssistant ? <BoardButton label={t('incident_command.assistant_title')} icon={Sparkles} iconOnly={iconOnly} onPress={onAssistant} testID="command-assistant" /> : null}
          {onDetails ? <BoardButton label={t('incident_command.command_details')} icon={Info} iconOnly={iconOnly} onPress={onDetails} testID="command-details" /> : null}
          {onTransfer ? <BoardButton label={t('incident_command.transfer_command')} icon={UserCog} iconOnly={iconOnly} onPress={onTransfer} testID="command-transfer" /> : null}
          {onEnd ? <BoardButton label={t('incident_command.end_command')} icon={XCircle} action="negative" iconOnly={iconOnly} onPress={onEnd} testID="command-end" /> : null}
          {extraActions ?? null}
        </HStack>
      </HStack>
      {command?.ImportantInformation ? (
        <View style={styles.important} className="rounded-lg border-l-4 border-warning-500 bg-warning-50" testID="command-important-information">
          <Text className="text-xs font-semibold text-warning-700">{t('incident_command.important_information')}</Text>
          <Text className="text-sm text-typography-900">{command.ImportantInformation}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { padding: 12 },
  important: { marginTop: 8, padding: 10 },
});
