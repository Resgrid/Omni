import { useTranslation } from '@resgrid/i18n';
import type { CommandStructureNode } from '@resgrid/models';
import { Badge, BadgeText, HStack, Text } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { WORK_TIME_COLORS, workTimeLevel, workTimeMinutes } from '../lib/board';

export interface WorkTimeLightProps {
  assignedOn?: string | null;
  /** The lane's thresholds (amber/red, MaxTimeInRole rotation). */
  node?: Pick<CommandStructureNode, 'WorkTimeAmberMinutes' | 'WorkTimeRedMinutes' | 'MaxTimeInRole'> | null;
  nowMs: number;
  testID?: string;
}

/** Minutes a resource has worked in its lane, coloured by the lane's thresholds; past MaxTimeInRole it is rotation due (IC). */
export const WorkTimeLight: React.FC<WorkTimeLightProps> = ({ assignedOn, node, nowMs, testID }) => {
  const { t } = useTranslation();
  const minutes = workTimeMinutes(assignedOn, nowMs);
  if (minutes === null) return null;
  const level = workTimeLevel(minutes, node);
  const isRotationDue = level === 'rotation';
  return (
    <HStack className="items-center" space="xs" testID={testID} accessibilityLabel={t('incident_command.work_time', { minutes })}>
      <View style={StyleSheet.flatten([styles.dot, { backgroundColor: WORK_TIME_COLORS[level] }])} testID={testID ? `${testID}-dot-${level}` : undefined} />
      <Text className={isRotationDue ? 'text-xs font-semibold text-error-600' : 'text-xs text-typography-500'}>{t('incident_command.minutes_short', { minutes })}</Text>
      {isRotationDue ? (
        <Badge action="error" variant="solid" size="sm" testID={testID ? `${testID}-rotation` : undefined}>
          <BadgeText>{t('incident_command.rotation_due')}</BadgeText>
        </Badge>
      ) : null}
    </HStack>
  );
};

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
});
