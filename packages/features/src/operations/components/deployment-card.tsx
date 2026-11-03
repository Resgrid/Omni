import { parseDateISOString } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { type Deployment, DeploymentStatus } from '@resgrid/models';
import { Badge, BadgeText, HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { BriefcaseBusiness, CalendarDays, ChevronRight, Hash } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

type BadgeTone = 'info' | 'warning' | 'success' | 'muted';

/** Planned reads as information, standby and demobilizing as in transition, active as under way, closed ones fade. */
export const deploymentStatusTone = (status: number): BadgeTone => {
  switch (status) {
    case DeploymentStatus.Active:
      return 'success';
    case DeploymentStatus.Standby:
    case DeploymentStatus.Demobilizing:
      return 'warning';
    case DeploymentStatus.Completed:
    case DeploymentStatus.Cancelled:
      return 'muted';
    default:
      return 'info';
  }
};

/** The calendar day a deployment starts or ends (the server's date part, as the time report reads it), in the person's locale. */
export const formatDeploymentDay = (value: string | null | undefined, locale?: string): string => {
  const day = (value ?? '').slice(0, 10);
  const date = parseDateISOString(day);
  if (!date) return day;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
  } catch {
    return day;
  }
};

export interface DeploymentCardProps {
  deployment: Deployment;
  onPress: (deployment: Deployment) => void;
}

/** One deployment in the list: name, status, the incident / request / order numbers and the dates it runs. */
export const DeploymentCard: React.FC<DeploymentCardProps> = React.memo(({ deployment, onPress }) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const status = t(`operations.status.${deployment.Status}`);
  const numbers = [deployment.IncidentNumber, deployment.RequestNumber, deployment.ResourceOrderNumber].filter(Boolean).join(' · ');
  const start = formatDeploymentDay(deployment.StartOn, i18n.language);
  const end = formatDeploymentDay(deployment.EndOn, i18n.language);
  const dates = start ? (end ? `${start} – ${end}` : start) : '';
  return (
    <Pressable
      onPress={() => onPress(deployment)}
      accessibilityRole="button"
      accessibilityLabel={[deployment.Name, status, numbers, dates].filter(Boolean).join(', ')}
      testID={`operations-deployment-${deployment.Id}`}
      className="flex-1 rounded-lg border border-outline-200 bg-background-0 p-3"
    >
      <HStack className="items-center" space="md">
        <View className="size-10 items-center justify-center rounded-full bg-primary-50">
          <BriefcaseBusiness size={20} color={colors.primary} />
        </View>
        <VStack className="flex-1" space="xs">
          <HStack className="items-start justify-between" space="sm">
            <Text className="flex-1 font-semibold text-typography-900" numberOfLines={2}>
              {deployment.Name}
            </Text>
            <Badge action={deploymentStatusTone(deployment.Status)} size="sm" testID={`operations-deployment-status-${deployment.Id}`}>
              <BadgeText>{status}</BadgeText>
            </Badge>
          </HStack>
          {numbers ? (
            <HStack className="items-center" space="xs">
              <View>
                <Hash size={14} color={colors.textMuted} />
              </View>
              <Text size="sm" className="flex-1 text-typography-500" numberOfLines={1}>
                {numbers}
              </Text>
            </HStack>
          ) : null}
          {dates ? (
            <HStack className="items-center" space="xs">
              <View>
                <CalendarDays size={14} color={colors.textMuted} />
              </View>
              <Text size="sm" className="flex-1 text-typography-500" numberOfLines={1}>
                {dates}
              </Text>
            </HStack>
          ) : null}
        </VStack>
        <View>
          <ChevronRight size={18} color={colors.icon} />
        </View>
      </HStack>
    </Pressable>
  );
});

DeploymentCard.displayName = 'DeploymentCard';
