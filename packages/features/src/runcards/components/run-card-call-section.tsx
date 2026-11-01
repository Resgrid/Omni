import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { HStack, Text, VStack } from '@resgrid/ui';
import { ClipboardList } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { AlarmLevelBadge } from './alarm-level-badge';
import { EscalateAlarmButton } from './escalate-alarm-button';

export interface RunCardCallSectionProps {
  call: Pick<CallResultData, 'CallId' | 'State' | 'AlarmLevel' | 'ActiveRunCardId'>;
  /** Escalating needs the authority to create/edit calls (rights DTO). */
  canEdit: boolean;
  /** Re-read the call after an escalation (new alarm level, new dispatches). */
  onEscalated?: () => void;
  testID?: string;
}

/**
 * A call's run card state on its detail page (Dispatch call detail: alarm level + "Strike Next Alarm"). Registered as a
 * call detail tab by `registerRunCardCallDetailTab`; also usable inline in a console.
 */
export const RunCardCallSection: React.FC<RunCardCallSectionProps> = ({ call, canEdit, onEscalated, testID = 'run-card-call-section' }) => {
  const { t } = useTranslation();
  const alarmLevel = typeof call.AlarmLevel === 'number' && call.AlarmLevel > 0 ? call.AlarmLevel : 1;
  return (
    <VStack space="md" className="p-4" testID={testID}>
      <HStack space="sm" className="items-center">
        <View>
          <ClipboardList size={18} color="#2563eb" />
        </View>
        <Text className="flex-1 font-semibold">{t('run_cards.alarm_level_label')}</Text>
        <Text className="font-bold" testID={`${testID}-level`}>
          {alarmLevel}
        </Text>
        <AlarmLevelBadge alarmLevel={alarmLevel} />
      </HStack>
      <EscalateAlarmButton callId={call.CallId} alarmLevel={alarmLevel} activeRunCardId={call.ActiveRunCardId ?? null} canEscalate={canEdit ? call.State === 0 : false} onEscalated={() => onEscalated?.()} />
    </VStack>
  );
};
