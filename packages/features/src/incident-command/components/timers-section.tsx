import { useTranslation } from '@resgrid/i18n';
import { type IncidentTimer, IncidentTimerStatus } from '@resgrid/models';
import { Badge, BadgeText, HStack, Text, VStack } from '@resgrid/ui';
import { Plus, Timer } from 'lucide-react-native';
import React, { useMemo } from 'react';

import { useNow } from '../hooks/use-now';
import { formatCountdown, isLocalId, timerDueInSeconds } from '../lib/board';
import { timerStatusAction, timerStatusName, timerTypeName } from '../lib/labels';
import { BoardButton } from './board-buttons';
import { SectionCard, SectionEmpty } from './section-card';

export interface TimersSectionProps {
  timers: IncidentTimer[];
  canManage: boolean;
  onAdd: () => void;
  onAcknowledge: (timer: IncidentTimer) => void;
  testID?: string;
}

/** Incident timers with a live countdown (IC timers section); a due timer is acknowledged to start its next interval. */
export const TimersSection: React.FC<TimersSectionProps> = ({ timers, canManage, onAdd, onAcknowledge, testID = 'command-timers' }) => {
  const { t } = useTranslation();
  const live = useMemo(() => timers.filter((timer) => timer.Status !== IncidentTimerStatus.Stopped), [timers]);
  const nowMs = useNow(1000, live.length > 0);

  return (
    <SectionCard
      title={t('incident_command.timers')}
      icon={Timer}
      count={live.length}
      action={canManage ? <BoardButton label={t('incident_command.start_timer')} icon={Plus} onPress={onAdd} testID={`${testID}-add`} /> : undefined}
      testID={testID}
    >
      {live.length === 0 ? (
        <SectionEmpty text={t('incident_command.no_timers')} />
      ) : (
        <VStack space="sm">
          {live.map((timer) => {
            const dueIn = timerDueInSeconds(timer, nowMs);
            const isDue = timer.Status === IncidentTimerStatus.Due || (dueIn !== null && dueIn <= 0);
            return (
              <HStack key={timer.IncidentTimerId} className={`items-center justify-between rounded-lg p-2 ${isDue ? 'bg-error-50' : 'bg-background-50'}`} space="sm" testID={`${testID}-item-${timer.IncidentTimerId}`}>
                <VStack className="min-w-0 flex-1">
                  <Text className="font-medium text-typography-900" numberOfLines={1}>
                    {timer.Name || timerTypeName(t, timer.TimerType)}
                  </Text>
                  <HStack className="items-center" space="xs">
                    <Badge action={isDue ? 'error' : timerStatusAction(timer.Status)} size="sm">
                      <BadgeText>{isDue ? timerStatusName(t, IncidentTimerStatus.Due) : timerStatusName(t, timer.Status)}</BadgeText>
                    </Badge>
                    {dueIn !== null ? (
                      <Text className={`text-sm ${isDue ? 'font-semibold text-error-600' : 'text-typography-700'}`} testID={`${testID}-countdown-${timer.IncidentTimerId}`}>
                        {formatCountdown(dueIn)}
                      </Text>
                    ) : null}
                  </HStack>
                </VStack>
                {canManage && isDue && !isLocalId(timer.IncidentTimerId) ? (
                  <BoardButton label={t('incident_command.acknowledge')} variant="solid" onPress={() => onAcknowledge(timer)} testID={`${testID}-ack-${timer.IncidentTimerId}`} />
                ) : null}
              </HStack>
            );
          })}
        </VStack>
      )}
    </SectionCard>
  );
};
