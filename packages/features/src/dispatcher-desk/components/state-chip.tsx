import { breakDueBackMs, isOnBreak } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { DispatcherDeskMemberData } from '@resgrid/models';
import React from 'react';

import { useNow } from '../hooks/use-dispatcher-desk';
import { displayStateLabelKey, displayStateTone, formatCountdown, wholeMinutes } from '../lib/desk-format';
import { DeskPill } from './desk-pill';

/** A dispatcher's state as a chip reads it. */
export interface StateChipLabel {
  label: string;
  /** On a break past its length. */
  overdue: boolean;
}

/** What a dispatcher's state reads as: the state, with the time left on a break or how long it is overdue. */
export const useStateChipLabel = (member: Pick<DispatcherDeskMemberData, 'DisplayState' | 'ActiveBreak' | 'IsSignedIn'> | null): StateChipLabel => {
  const { t } = useTranslation();
  const onBreak = isOnBreak(member);
  const now = useNow(1000, onBreak);
  const state = member?.IsSignedIn ? member.DisplayState : 0;

  if (!onBreak) return { label: t(displayStateLabelKey(state)), overdue: false };
  const dueBack = breakDueBackMs(member?.ActiveBreak);

  if (dueBack === null) return { label: t(displayStateLabelKey(state)), overdue: false };

  return dueBack >= now
    ? { label: t('dispatcher_desk.state.on_break_left', { time: formatCountdown(dueBack - now) }), overdue: false }
    : { label: t('dispatcher_desk.state.on_break_overdue', { minutes: Math.max(1, wholeMinutes(now - dueBack)) }), overdue: true };
};

export interface StateChipProps {
  member: Pick<DispatcherDeskMemberData, 'DisplayState' | 'ActiveBreak' | 'IsSignedIn'> | null;
  testID?: string;
}

/** A dispatcher's desk state as a pill; on break it counts down to the expected return and turns red once overdue. */
export const StateChip: React.FC<StateChipProps> = ({ member, testID = 'desk-state-chip' }) => {
  const { label, overdue } = useStateChipLabel(member);
  const state = member?.IsSignedIn ? member.DisplayState : 0;

  return <DeskPill label={label} tone={overdue ? 'error' : displayStateTone(state)} testID={overdue ? `${testID}-overdue` : testID} />;
};
