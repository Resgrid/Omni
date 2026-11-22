import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { DESK_PRESENCE_KEY, isHeldBy, isOfferedTo, isWaitingInQueue, nextBreakOf, useDispatcherDeskStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { DispatcherDisplayState } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, Pressable, Text, useFormFactor, useThemeColors } from '@resgrid/ui';
import { useRouter } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronDown, ChevronUp, Coffee, Headset, LogIn, LogOut, Moon, Undo2, UserCheck } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useDeskActions } from '../hooks/use-desk-actions';
import { noteOwnBreakEnd } from '../hooks/use-desk-alerts';
import { useDispatcherDeskView } from '../hooks/use-dispatcher-desk';
import { openDeskSheet } from '../lib/desk-ui-store';
import { dispatcherDeskRoutes } from '../routes';
import { StateChip, useStateChipLabel } from './state-chip';

export interface DeskStatusBarProps {
  /** The shell hides it where the screen shows the same (none today). */
  hidden?: boolean;
}

interface BarAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  primary?: boolean;
}

/**
 * The dispatcher's desk status under the app bar (Dispatch, while the department's desk is on and the member is a
 * dispatcher): their state (Available, Busy, Away, On break with a live countdown to the expected return, red once
 * overdue), the work offered to them, held by them and waiting, and the quick actions for the state they are in — sign
 * in, go available, away, take a break, "I'm back", sign off. A phone shows one line with the main action and the rest
 * behind "More"; a tablet or desktop shows them all.
 */
export const DeskStatusBar: React.FC<DeskStatusBarProps> = ({ hidden = false }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const { isPhone } = useFormFactor();
  const { me, queue, isAvailable, isSignedIn, onBreak, desk } = useDispatcherDeskView();
  const presenceBusy = useDispatcherDeskStore((state) => state.busyKeys.includes(DESK_PRESENCE_KEY));
  const actions = useDeskActions();
  const { overdue } = useStateChipLabel(me);
  const [expanded, setExpanded] = useState(false);
  const userId = me?.UserId ?? null;

  const counts = useMemo(
    () => ({
      offered: queue.filter((item) => isOfferedTo(item, userId)).length,
      held: queue.filter((item) => isHeldBy(item, userId)).length,
      waiting: queue.filter(isWaitingInQueue).length,
    }),
    [queue, userId]
  );

  const barActions = useMemo<BarAction[]>(() => {
    const store = () => useDispatcherDeskStore.getState();
    const signOff: BarAction = { id: 'sign-off', label: t('dispatcher_desk.actions.sign_off'), icon: LogOut, onPress: () => openDeskSheet('signOff') };

    const takeBreak: BarAction = {
      id: 'take-break',
      label: t('dispatcher_desk.actions.take_break'),
      icon: Coffee,
      onPress: () => openDeskSheet('takeBreak', { plannedBreakId: nextBreakOf(me, desk?.MyBreaks ?? [])?.DispatcherBreakId ?? null }),
    };

    if (!isSignedIn) return [{ id: 'sign-in', label: t('dispatcher_desk.actions.sign_in'), icon: LogIn, onPress: () => openDeskSheet('signIn'), primary: true }];

    if (onBreak) {
      return [
        {
          id: 'end-break',
          label: t('dispatcher_desk.actions.im_back'),
          icon: Undo2,
          primary: true,
          onPress: () => {
            noteOwnBreakEnd();
            void actions.run(() => store().endBreak(), { success: t('dispatcher_desk.actions.im_back_done') });
          },
        },
        signOff,
      ];
    }

    if (me?.DisplayState === DispatcherDisplayState.Away) {
      return [{ id: 'available', label: t('dispatcher_desk.actions.go_available'), icon: UserCheck, primary: true, onPress: () => void actions.run(() => store().setAvailable()) }, takeBreak, signOff];
    }

    return [{ ...takeBreak, primary: true }, { id: 'away', label: t('dispatcher_desk.actions.away'), icon: Moon, onPress: () => void actions.run(() => store().setAway()) }, signOff];
  }, [actions, desk?.MyBreaks, isSignedIn, me, onBreak, t]);

  if (hidden || !isAvailable || !me) return null;

  const primary = barActions.find((action) => action.primary) ?? barActions[0];
  const secondary = barActions.filter((action) => action !== primary);
  const shownInline = isPhone ? [primary] : barActions;
  const tone = overdue ? 'border-error-300 bg-error-50' : onBreak ? 'border-warning-300 bg-background-warning' : 'border-outline-200 bg-background-50';

  const countsLabel = isSignedIn
    ? t('dispatcher_desk.status_bar.counts', { offered: counts.offered, held: counts.held, waiting: counts.waiting })
    : t('dispatcher_desk.status_bar.not_signed_in', { waiting: counts.waiting });

  const renderAction = (action: BarAction) => {
    const Icon = action.icon;

    return (
      <Button
        key={action.id}
        size="xs"
        action={action.primary ? 'primary' : 'secondary'}
        variant={action.primary ? 'solid' : 'outline'}
        onPress={action.onPress}
        isDisabled={presenceBusy}
        accessibilityLabel={action.label}
        className="ml-2 min-h-[36px]"
        testID={`desk-bar-${action.id}`}
      >
        {presenceBusy && action.primary ? (
          <ButtonSpinner />
        ) : (
          <View>
            <Icon size={14} color={action.primary ? colors.textInverse : colors.icon} />
          </View>
        )}
        <ButtonText>{action.label}</ButtonText>
      </Button>
    );
  };

  return (
    <View className={`border-b px-3 py-1.5 ${tone}`} testID="desk-status-bar">
      <HStack className="items-center justify-between">
        <Pressable
          onPress={() => pushRoutePath(router, dispatcherDeskRoutes.desk())}
          accessibilityRole="button"
          accessibilityLabel={`${t('dispatcher_desk.title')}: ${countsLabel}`}
          className="mr-2 shrink flex-row items-center"
          testID="desk-status-bar-open"
        >
          <View className="mr-2">
            <Headset size={16} color={colors.icon} />
          </View>
          {isSignedIn ? <StateChip member={me} /> : null}
          <Text size="xs" className="ml-2 min-w-0 shrink text-typography-700" numberOfLines={1} testID="desk-status-bar-counts">
            {countsLabel}
          </Text>
        </Pressable>
        {/* The actions keep their size; the counts give way (a 375-wide phone on break has no room for both). */}
        <HStack className="shrink-0 items-center" testID="desk-status-bar-actions">
          {shownInline.map(renderAction)}
          {isPhone && secondary.length > 0 ? (
            <Pressable
              onPress={() => setExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={t(expanded ? 'dispatcher_desk.status_bar.less' : 'dispatcher_desk.status_bar.more')}
              accessibilityState={{ expanded }}
              className="ml-1 min-h-[36px] min-w-[36px] items-center justify-center"
              testID="desk-status-bar-more"
            >
              <View>{expanded ? <ChevronUp size={18} color={colors.icon} /> : <ChevronDown size={18} color={colors.icon} />}</View>
            </Pressable>
          ) : null}
        </HStack>
      </HStack>
      {isPhone && expanded && secondary.length > 0 ? (
        <HStack className="mt-1.5 flex-wrap justify-end" testID="desk-status-bar-more-actions">
          {secondary.map(renderAction)}
        </HStack>
      ) : null}
    </View>
  );
};
