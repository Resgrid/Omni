import { type RecurringOccurrenceAction, recurringOccurrenceKey } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { RecurringCallOccurrenceInput } from '@resgrid/models';
import type { LucideIcon } from 'lucide-react-native';
import { CalendarPlus, RotateCcw, Send, SkipForward } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { ActionButton, type ActionButtonTone } from './action-button';

const ACTIONS: Record<RecurringOccurrenceAction, { labelKey: string; icon: LucideIcon; tone: ActionButtonTone }> = {
  dispatch: { labelKey: 'recurring_calls.occurrence.send_now', icon: Send, tone: 'primary' },
  create: { labelKey: 'recurring_calls.occurrence.create_call', icon: CalendarPlus, tone: 'secondary' },
  skip: { labelKey: 'recurring_calls.occurrence.skip', icon: SkipForward, tone: 'negative' },
  restore: { labelKey: 'recurring_calls.occurrence.restore', icon: RotateCcw, tone: 'primary' },
};

export interface OccurrenceButtonsProps {
  occurrence: RecurringCallOccurrenceInput;
  actions: readonly RecurringOccurrenceAction[];
  busyKey: string | null;
  onAction: (action: RecurringOccurrenceAction, occurrence: RecurringCallOccurrenceInput) => void;
  /** Names the occurrence for screen readers ("Transfers 08:00"). */
  label: string;
  testID: string;
}

/** The actions one occurrence offers (Send now, Create call, Skip, Restore), spinning while any of them runs. */
export const OccurrenceButtons: React.FC<OccurrenceButtonsProps> = ({ occurrence, actions, busyKey, onAction, label, testID }) => {
  const { t } = useTranslation();
  const isBusy = busyKey === recurringOccurrenceKey(occurrence);

  if (actions.length === 0) return null;

  return (
    <View className="mt-2 flex-row flex-wrap justify-end" testID={testID}>
      {actions.map((action) => (
        <ActionButton
          key={action}
          label={t(ACTIONS[action].labelKey)}
          icon={ACTIONS[action].icon}
          tone={ACTIONS[action].tone}
          isBusy={isBusy}
          onPress={() => onAction(action, occurrence)}
          accessibilityLabel={`${t(ACTIONS[action].labelKey)} ${label}`}
          testID={`${testID}-${action}`}
        />
      ))}
    </View>
  );
};
