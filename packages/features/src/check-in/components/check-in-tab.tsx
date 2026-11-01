import { useCapability } from '@resgrid/config';
import { getDataSessionScope, personnelFullName, useCheckInTimersStore, usePersonnelStore, useUnitRolesStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallPersonnelCheckInStatusResultData, CheckInTimerStatusResultData } from '@resgrid/models';
import { useRealtimeRefetch } from '@resgrid/realtime';
import { Button, ButtonText, Loading, Text, useToast } from '@resgrid/ui';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CheckInType } from '../lib/check-in-status';
import { canCheckInTimer, type CheckInAbility, type CheckInIdentity, checkInTimerTitle } from '../lib/check-in-target';
import { CheckInHistoryList } from './check-in-history-list';
import { CheckInSheet, type CheckInTarget } from './check-in-sheet';
import { CheckInTimerCard } from './check-in-timer-card';
import { ParList } from './par-list';

export interface CheckInTabProps {
  callId: string | number;
  timersEnabled: boolean;
  /** Overrides the variant capability (tests, embedded panels). */
  ability?: CheckInAbility;
  /** Overrides the signed-in identity (the Unit app passes its active unit). */
  identity?: CheckInIdentity;
  /** Silent status poll while visible (Dispatch); 0 disables. */
  pollMs?: number;
}

const EMPTY_TIMERS: CheckInTimerStatusResultData[] = [];
const EMPTY_PAR: CallPersonnelCheckInStatusResultData[] = [];

/** The signed-in member and the units they ride on. */
function useCheckInIdentity(override?: CheckInIdentity): CheckInIdentity {
  const seats = useUnitRolesStore((state) => state.roles);
  const scope = getDataSessionScope();
  return useMemo(() => {
    if (override) return override;
    const userId = scope?.userId ?? null;
    const unitIds = new Set<string>(seats.filter((seat) => userId && seat.UserId === userId).map((seat) => seat.UnitId));
    if (scope?.unitId !== undefined && scope.unitId !== null) unitIds.add(String(scope.unitId));
    return { userId, unitIds: [...unitIds] };
  }, [override, scope?.unitId, scope?.userId, seats]);
}

/**
 * Check-in / PAR for one call (omni-plan §7.10: Responder check-in target + Dispatch sheet + Unit timer card). Who may
 * check in follows `capabilities.checkIn`: `self` (the member and their unit), `others` (IC/Dispatch on anyone's behalf,
 * with the PAR list); neither = read-only (BigBoard).
 */
export const CheckInTab: React.FC<CheckInTabProps> = ({ callId, timersEnabled, ability: abilityOverride, identity: identityOverride, pollMs = 30000 }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const capability = useCapability('checkIn');
  const ability: CheckInAbility = abilityOverride ?? { self: capability.self, others: capability.others };
  const identity = useCheckInIdentity(identityOverride);
  const numericCallId = Number(callId);
  const key = String(callId);
  const timers = useCheckInTimersStore((state) => state.statusesByCall[key] ?? EMPTY_TIMERS);
  const history = useCheckInTimersStore((state) => state.historyByCall[key]);
  const par = useCheckInTimersStore((state) => state.personnelStatusesByCall[key] ?? EMPTY_PAR);
  const queuedCheckIns = useCheckInTimersStore((state) => state.queuedCheckIns);
  const isLoading = useCheckInTimersStore((state) => state.loading.statuses === true);
  const fetchTimerStatuses = useCheckInTimersStore((state) => state.fetchTimerStatuses);
  const fetchCheckInHistory = useCheckInTimersStore((state) => state.fetchCheckInHistory);
  const fetchCallPersonnelStatuses = useCheckInTimersStore((state) => state.fetchCallPersonnelStatuses);
  const toggleTimers = useCheckInTimersStore((state) => state.toggleTimers);
  const personnel = usePersonnelStore((state) => state.personnel);
  const [sheetTarget, setSheetTarget] = useState<CheckInTarget | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const readOnly = !ability.self && !ability.others;

  const refresh = useCallback(async () => {
    if (!Number.isFinite(numericCallId)) return;
    const tasks: Promise<void>[] = [fetchTimerStatuses(numericCallId, { bypassCache: true }), fetchCheckInHistory(numericCallId)];
    if (ability.others) tasks.push(fetchCallPersonnelStatuses(numericCallId));
    await Promise.all(tasks);
  }, [ability.others, fetchCallPersonnelStatuses, fetchCheckInHistory, fetchTimerStatuses, numericCallId]);

  useEffect(() => {
    if (timersEnabled) void refresh();
  }, [refresh, timersEnabled]);

  useEffect(() => {
    if (!timersEnabled || pollMs <= 0 || !Number.isFinite(numericCallId)) return undefined;
    const handle = setInterval(() => void fetchTimerStatuses(numericCallId, { silent: true }), pollMs);
    return () => clearInterval(handle);
  }, [fetchTimerStatuses, numericCallId, pollMs, timersEnabled]);

  useRealtimeRefetch(['checkInUpdated', 'eventingHubJoined'], refresh, timersEnabled);

  const queuedTargets = useMemo(() => {
    const set = new Set<string>();
    for (const queued of Object.values(queuedCheckIns)) if (queued.callId === numericCallId && queued.state === 'queued') set.add(`${queued.checkInType}:${queued.userId ?? ''}:${queued.unitId ?? ''}`);
    return set;
  }, [numericCallId, queuedCheckIns]);

  const nameFor = useCallback(
    (userId: string) => {
      const person = personnel.find((candidate) => candidate.UserId === userId);
      return person ? personnelFullName(person) : undefined;
    },
    [personnel]
  );

  const openSheet = (target: CheckInTarget | null) => {
    setSheetTarget(target);
    setIsSheetOpen(true);
  };

  const onTimerCheckIn = (timer: CheckInTimerStatusResultData) =>
    openSheet({
      checkInType: timer.TargetType,
      userId: ability.others && timer.TargetType === CheckInType.Personnel && timer.TargetEntityId ? timer.TargetEntityId : null,
      unitId: timer.UnitId,
      name: checkInTimerTitle(timer) || undefined,
    });

  const enableTimers = async () => {
    const ok = await toggleTimers(numericCallId, true);
    if (!ok) toast.error(t('check_in.toggle_error'));
  };

  if (!timersEnabled) {
    return (
      <View style={styles.panel} testID="check-in-tab">
        <Text className="text-typography-600">{t('check_in.timers_disabled')}</Text>
        {ability.others ? (
          <Button size="sm" variant="outline" className="mt-3 self-start" onPress={() => void enableTimers()} accessibilityLabel={t('check_in.enable_timers')} testID="check-in-enable-timers">
            <ButtonText>{t('check_in.enable_timers')}</ButtonText>
          </Button>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.panel} testID="check-in-tab">
      {!readOnly ? (
        <Button size="md" className="mb-3" onPress={() => openSheet(null)} accessibilityLabel={t('check_in.quick_check_in')} testID="check-in-quick">
          <ButtonText>{t('check_in.quick_check_in')}</ButtonText>
        </Button>
      ) : null}

      {isLoading && timers.length === 0 ? (
        <Loading text="" />
      ) : timers.length === 0 ? (
        <Text className="text-typography-600">{t('check_in.no_timers')}</Text>
      ) : (
        timers.map((timer) => (
          <CheckInTimerCard
            key={`${timer.TargetType}-${timer.TargetEntityId}-${timer.UnitId ?? ''}`}
            timer={timer}
            onCheckIn={onTimerCheckIn}
            showCheckInButton={canCheckInTimer(timer, ability, identity)}
            isQueued={queuedTargets.has(`${timer.TargetType}:${ability.others && timer.TargetType === CheckInType.Personnel ? timer.TargetEntityId : ''}:${timer.UnitId ?? ''}`)}
          />
        ))
      )}

      {ability.others ? <ParList rows={par} onCheckIn={(row) => openSheet({ checkInType: CheckInType.Personnel, userId: row.UserId, name: row.FullName })} /> : null}

      <CheckInHistoryList records={history ?? []} nameFor={nameFor} />

      {!readOnly ? <CheckInSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} callId={numericCallId} ability={ability} target={sheetTarget} /> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
});
