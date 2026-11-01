import { useTranslation } from '@resgrid/i18n';
import { Badge, BadgeText } from '@resgrid/ui';
import React from 'react';

import { useIsRunCardsEnabled } from '../hooks/use-run-card-flags';

export interface AlarmLevelBadgeProps {
  /** Alarm level from the call payload. 1 (or 0 on pre-run-card calls) means never escalated. */
  alarmLevel: number | null | undefined;
  testID?: string;
}

/**
 * A call's alarm level once escalated above the first. Hidden at level 1 (every call is a first alarm, badging them all
 * would hide the few that matter) and when run cards are off (alarm levels only move through a run card).
 */
export const AlarmLevelBadge: React.FC<AlarmLevelBadgeProps> = ({ alarmLevel, testID = 'alarm-level-badge' }) => {
  const { t } = useTranslation();
  const isRunCardsEnabled = useIsRunCardsEnabled();
  if (!isRunCardsEnabled || typeof alarmLevel !== 'number' || alarmLevel <= 1) return null;
  return (
    <Badge action="warning" testID={testID}>
      <BadgeText>{t('run_cards.alarm_level', { level: alarmLevel })}</BadgeText>
    </Badge>
  );
};
