import { useAuthStore } from '@resgrid/auth';
import { type ShiftActionOutcome, useShiftsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type ShiftDayGroupNeedsResultData, ShiftDayMyStatus, type ShiftDayResultData, type ShiftDayRosterResultData, type ShiftPersonOptionResultData } from '@resgrid/models';
import { Badge, BadgeText, Box, Button, ButtonSpinner, ButtonText, HStack, Input, InputField, Spinner, Text, Textarea, TextareaInput, useThemeColors, VStack } from '@resgrid/ui';
import { AlertCircle, CheckCircle, Clock, Repeat, Truck, UserMinus, UserPlus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useShiftAction } from '../hooks/use-shift-action';
import { refreshAfterShiftChange } from '../lib/shift-loaders';
import { canManageRosterEntry, canRequestTradeForDay, canWithdrawFromDay, getAssignmentTypeKey, getGroupOpenSlots, getManageableGroups, getMyStatusLabel, getRosterSourceLabel, groupRoster } from '../lib/shift-rules';
import { formatShiftLongDate, formatShiftTime, isOvernightShift, isWorkshiftDay } from '../lib/shift-time';
import { ShiftSelectRow } from './shift-select-row';

type DayPanel = 'details' | 'signup' | 'withdraw' | 'trade' | 'cancel-trade' | 'add' | 'remove' | 'review';

/** An open request goes to everyone eligible for the slot; a targeted one only to the people picked. */
type TradeMode = 'open' | 'specific';

const NO_PEOPLE: ShiftPersonOptionResultData[] = [];

const personSubtitle = (option: Pick<ShiftPersonOptionResultData, 'GroupName' | 'Roles'>): string => [option.GroupName, (option.Roles ?? []).join(', ')].filter((part) => !!part).join(' · ');

interface RosterRowProps {
  entry: ShiftDayRosterResultData;
  isMe: boolean;
  canManage: boolean;
  onReview: (entry: ShiftDayRosterResultData, approve: boolean) => void;
  onRemove: (entry: ShiftDayRosterResultData) => void;
}

const RosterRow: React.FC<RosterRowProps> = ({ entry, isMe, canManage, onReview, onRemove }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const source = getRosterSourceLabel(entry.Source);
  const roles = (entry.Roles ?? []).join(', ');
  return (
    <VStack space="xs" className="rounded-lg bg-background-50 p-3" testID={`roster-entry-${entry.UserId}`}>
      <HStack className="items-center justify-between" space="sm">
        <Text size="sm" className="flex-1 font-medium text-typography-900">
          {entry.Name}
        </Text>
        {isMe ? (
          <Badge action="success" size="sm">
            <BadgeText>{t('shifts.you')}</BadgeText>
          </Badge>
        ) : null}
      </HStack>
      {roles ? (
        <Text size="xs" className="text-typography-600">
          {roles}
        </Text>
      ) : null}
      <HStack className="flex-wrap">
        {entry.ApprovalPending ? (
          <Badge action="warning" size="sm" className="mb-1 mr-1" testID={`roster-pending-${entry.UserId}`}>
            <BadgeText>{t('shifts.status.pending_approval')}</BadgeText>
          </Badge>
        ) : null}
        <Badge action={source.action} size="sm" className="mb-1 mr-1">
          <BadgeText>{t(source.key)}</BadgeText>
        </Badge>
        {entry.TradedFromName ? (
          <Badge action="info" size="sm" className="mb-1 mr-1" testID={`roster-trade-${entry.UserId}`}>
            <BadgeText>{t('shifts.day.covering_for', { name: entry.TradedFromName })}</BadgeText>
          </Badge>
        ) : null}
      </HStack>
      {canManage ? (
        <HStack space="sm" className="mt-1 flex-wrap">
          {entry.ApprovalPending && entry.ShiftSignupId ? (
            <>
              <Button size="sm" action="positive" onPress={() => onReview(entry, true)} accessibilityLabel={t('shifts.review.approve_person', { name: entry.Name })} testID={`roster-approve-${entry.UserId}`}>
                <ButtonText>{t('shifts.actions.approve')}</ButtonText>
              </Button>
              <Button size="sm" action="negative" variant="outline" onPress={() => onReview(entry, false)} accessibilityLabel={t('shifts.review.deny_person', { name: entry.Name })} testID={`roster-deny-${entry.UserId}`}>
                <ButtonText>{t('shifts.actions.deny')}</ButtonText>
              </Button>
            </>
          ) : null}
          <Button size="sm" action="negative" variant="link" onPress={() => onRemove(entry)} accessibilityLabel={t('shifts.remove_panel.remove_person', { name: entry.Name })} testID={`roster-remove-${entry.UserId}`}>
            <View>
              <UserMinus size={14} color={colors.error} />
            </View>
            <ButtonText>{t('shifts.actions.remove')}</ButtonText>
          </Button>
        </HStack>
      ) : null}
    </VStack>
  );
};

const GroupNeedsCard: React.FC<{ group: ShiftDayGroupNeedsResultData }> = ({ group }) => {
  const { t } = useTranslation();
  const open = getGroupOpenSlots(group);
  const needs = group.GroupNeeds ?? [];
  return (
    <VStack className="mb-2 rounded-lg border border-outline-200 bg-background-0 p-3" testID={`group-needs-${group.GroupId}`}>
      <HStack className="items-center justify-between">
        <Text className="font-semibold text-typography-900">{group.GroupName}</Text>
        <Badge action={open > 0 ? 'warning' : 'success'} size="sm">
          <BadgeText>{open > 0 ? t('shifts.day.group_open', { count: open }) : t('shifts.day.group_filled')}</BadgeText>
        </Badge>
      </HStack>
      {needs.length > 0 ? (
        <VStack space="xs" className="mt-2">
          {needs.map((role) => (
            <HStack key={role.RoleId} className="items-center justify-between">
              <Text size="sm" className="text-typography-700">
                {role.RoleName}
              </Text>
              <Text size="sm" className="font-medium text-typography-700">
                {`${t('shifts.needed')}: ${role.Needed}`}
              </Text>
            </HStack>
          ))}
        </VStack>
      ) : (
        <Text size="xs" className="mt-1 text-typography-500">
          {t('shifts.day.no_role_requirements')}
        </Text>
      )}
    </VStack>
  );
};

export interface ShiftDayDetailsProps {
  shiftDayId: string;
  /** A light copy (from a list) shown at once while the full day (roster, needs) loads. */
  fallback?: ShiftDayResultData | null;
  /** Static shift (workshift) days load from their own endpoint. Defaults to the fallback's type. */
  workshift?: boolean;
}

/**
 * One shift day: when, staffing, the caller's standing, open needs and roster, plus inline panels for sign-up
 * (pick a team), withdraw, request/cancel a trade and — for supervisors — add, remove and review sign-ups.
 */
export const ShiftDayDetails: React.FC<ShiftDayDetailsProps> = ({ shiftDayId, fallback = null, workshift }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const colors = useThemeColors();
  const userId = useAuthStore((state) => state.userId);
  const loaded = useShiftsStore((state) => state.shiftDaysById[shiftDayId]);
  const isDayLoading = useShiftsStore((state) => state.loading.shiftDay === true);
  const candidates = useShiftsStore((state) => state.tradeCandidatesByDay[shiftDayId] ?? NO_PEOPLE);
  const isCandidatesLoading = useShiftsStore((state) => state.loading.candidates === true);
  const personnelOptions = useShiftsStore((state) => state.personnelOptionsByDay[shiftDayId] ?? NO_PEOPLE);
  const isOptionsLoading = useShiftsStore((state) => state.loading.personnelOptions === true);
  const { busy, run } = useShiftAction();

  const day = loaded ?? fallback;
  const isWorkshift = workshift ?? isWorkshiftDay(day);

  const [panel, setPanel] = useState<DayPanel>('details');
  const [tradeMode, setTradeMode] = useState<TradeMode>('open');
  const [signupGroupId, setSignupGroupId] = useState('');
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [addGroupId, setAddGroupId] = useState('');
  const [addUserId, setAddUserId] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [target, setTarget] = useState<ShiftDayRosterResultData | null>(null);
  const [reviewApprove, setReviewApprove] = useState(true);

  // A different day starts again from the overview, and loads its full copy (roster, needs).
  useEffect(() => {
    setPanel('details');
    setNote('');
    setCandidateIds([]);
    setTarget(null);
    if (shiftDayId) void useShiftsStore.getState().fetchShiftDay(shiftDayId, { workshift: isWorkshift });
  }, [shiftDayId, isWorkshift]);

  const manageableGroups = useMemo(() => (day ? getManageableGroups(day) : []), [day]);
  const rosterGroups = useMemo(() => groupRoster(day?.Roster ?? [], t('shifts.day.no_group'), isWorkshift), [day, isWorkshift, t]);
  const filteredPersonnel = useMemo(() => {
    const query = personSearch.trim().toLowerCase();
    return query ? personnelOptions.filter((option) => option.Name.toLowerCase().includes(query) || (option.GroupName ?? '').toLowerCase().includes(query)) : personnelOptions;
  }, [personnelOptions, personSearch]);

  const finish = useCallback(
    (outcome: ShiftActionOutcome) => {
      if (!outcome.success) return;
      setPanel('details');
      setNote('');
      void refreshAfterShiftChange({ shiftDayId, workshift: isWorkshift });
    },
    [shiftDayId, isWorkshift]
  );

  if (!day) {
    return isDayLoading ? (
      <HStack space="sm" className="items-center justify-center py-8" testID="shift-day-loading">
        <Spinner size="small" />
        <Text size="sm" className="text-typography-500">
          {t('shifts.loading_details')}
        </Text>
      </HStack>
    ) : (
      <Text size="sm" className="py-8 text-center text-typography-500" testID="shift-day-missing">
        {t('shifts.errors.not_found')}
      </Text>
    );
  }

  const store = useShiftsStore.getState();
  const anyBusy = busy !== null;
  const myStatus = getMyStatusLabel(day.MyStatus);
  const overnight = isOvernightShift(day.Start, day.End);
  const canWithdraw = canWithdrawFromDay(day, userId);
  const canTrade = canRequestTradeForDay(day);
  // Static shift days are staffed from unit crews: no sign-ups, withdrawals or per-day roster edits here.
  const canManageDay = day.CanManage && !isWorkshift;
  const isRosterLoading = isDayLoading && (day.Roster ?? []).length === 0;
  const needs = day.Needs ?? [];

  const openSignup = () => {
    // Preselect only when there is no choice to make; otherwise the responder picks their team.
    setSignupGroupId(needs.length === 1 ? (needs[0]?.GroupId ?? '') : '');
    setPanel('signup');
  };
  const openTrade = () => {
    setCandidateIds([]);
    setNote('');
    setTradeMode('open');
    setPanel('trade');
    // Candidates show how many people an open request reaches. Static shift days are always open requests.
    if (!isWorkshift) void store.fetchTradeCandidates(day.ShiftDayId);
  };
  const openAdd = () => {
    setAddGroupId(manageableGroups[0]?.GroupId ?? '');
    setAddUserId('');
    setPersonSearch('');
    setPanel('add');
    void store.fetchPersonnelOptions(day.ShiftDayId);
  };
  const openRemove = (entry: ShiftDayRosterResultData) => {
    setTarget(entry);
    setNote('');
    setPanel('remove');
  };
  const openReview = (entry: ShiftDayRosterResultData, approve: boolean) => {
    setTarget(entry);
    setReviewApprove(approve);
    setNote('');
    setPanel('review');
  };
  const back = () => {
    setPanel('details');
    setNote('');
  };

  const submitSignup = async () => {
    if (!signupGroupId) return;
    finish(
      await run(
        'signup',
        () => store.signupForShift(day.ShiftDayId, signupGroupId),
        (outcome) => (outcome.approvalPending ? 'shifts.toast.signup_pending' : 'shifts.signup_success')
      )
    );
  };
  const submitWithdraw = async () => {
    if (!day.MySignupId) return;
    finish(await run('withdraw', () => store.withdrawFromShift(day.MySignupId), 'shifts.withdraw_success'));
  };
  const submitTrade = async () => {
    const userIds = tradeMode === 'specific' && !isWorkshift ? candidateIds : [];
    if (tradeMode === 'specific' && !isWorkshift && userIds.length === 0) return;
    finish(
      await run('request-trade', () => store.requestTrade(day.ShiftDayId, userIds, note.trim(), { workshift: isWorkshift }), userIds.length > 0 ? 'shifts.toast.trade_requested' : 'shifts.toast.trade_requested_open')
    );
  };
  const submitCancelTrade = async () => {
    if (!day.MyTradeId) return;
    finish(await run('cancel-trade', () => store.cancelTrade(day.MyTradeId), 'shifts.toast.trade_cancelled'));
  };
  const submitAdd = async () => {
    if (!addGroupId || !addUserId) return;
    finish(await run('assign', () => store.assignToShiftDay(day.ShiftDayId, addUserId, addGroupId), 'shifts.toast.person_added'));
  };
  const submitRemove = async () => {
    if (!target) return;
    finish(await run('remove', () => store.removeFromShiftDay(day.ShiftDayId, target.UserId, note.trim()), 'shifts.toast.person_removed'));
  };
  const submitReview = async () => {
    if (!target?.ShiftSignupId) return;
    finish(await run('review-signup', () => store.reviewSignup(target.ShiftSignupId, reviewApprove, note.trim()), reviewApprove ? 'shifts.toast.approved' : 'shifts.toast.denied'));
  };

  const noteField = (testID: string) => (
    <VStack space="xs">
      <Text size="sm" className="font-medium text-typography-700">
        {t('shifts.note_label')}
      </Text>
      <Textarea size="md">
        <TextareaInput value={note} onChangeText={setNote} placeholder={t('shifts.note_optional_placeholder')} accessibilityLabel={t('shifts.note_label')} testID={testID} />
      </Textarea>
    </VStack>
  );

  const footer = (confirmLabel: string, onConfirm: () => Promise<void>, busyKey: string, disabled: boolean, action: 'primary' | 'positive' | 'negative', testID: string) => {
    const isBusy = busy === busyKey;
    return (
      <HStack space="sm" className="mt-2">
        <Button variant="outline" action="secondary" className="flex-1" onPress={back} isDisabled={isBusy} testID={`${testID}-back`}>
          <ButtonText>{t('common.back')}</ButtonText>
        </Button>
        <Button action={action} className="flex-1" onPress={() => void onConfirm()} isDisabled={disabled || isBusy} accessibilityState={{ disabled: disabled || isBusy, busy: isBusy }} testID={testID}>
          {isBusy ? <ButtonSpinner /> : null}
          <ButtonText>{confirmLabel}</ButtonText>
        </Button>
      </HStack>
    );
  };

  const loadingRow = (testID: string) => (
    <HStack space="sm" className="items-center py-2" testID={testID}>
      <Spinner size="small" />
      <Text size="sm" className="text-typography-500">
        {t('shifts.loading')}
      </Text>
    </HStack>
  );

  const renderDetails = () => (
    <VStack space="lg">
      {myStatus ? (
        <Box
          className={`rounded-lg p-3 ${day.MyStatus === ShiftDayMyStatus.OnRoster ? 'bg-background-success' : day.MyStatus === ShiftDayMyStatus.PendingApproval ? 'bg-background-warning' : 'bg-background-error'}`}
          testID="shift-day-my-status-card"
        >
          <HStack space="sm" className="items-center">
            <View>
              {day.MyStatus === ShiftDayMyStatus.OnRoster ? (
                <CheckCircle size={18} color={colors.success} />
              ) : (
                <AlertCircle size={18} color={day.MyStatus === ShiftDayMyStatus.PendingApproval ? colors.warning : colors.error} />
              )}
            </View>
            <VStack className="flex-1">
              <Text className="font-semibold text-typography-900">{t(myStatus.key)}</Text>
              {day.MyStatus === ShiftDayMyStatus.PendingApproval ? (
                <Text size="sm" className="text-typography-700">
                  {t('shifts.day.pending_note')}
                </Text>
              ) : null}
              {day.MyStatus === ShiftDayMyStatus.Denied ? (
                <Text size="sm" className="text-typography-700">
                  {t('shifts.day.denied_note')}
                </Text>
              ) : null}
            </VStack>
          </HStack>
        </Box>
      ) : null}

      {day.MyTradeId ? (
        <Box className="rounded-lg bg-background-info p-3" testID="shift-day-trade-card">
          <HStack space="sm" className="items-center">
            <View>
              <Repeat size={18} color={colors.info} />
            </View>
            <Text size="sm" className="flex-1 text-typography-800">
              {t('shifts.day.trade_pending_note')}
            </Text>
          </HStack>
        </Box>
      ) : null}

      {day.RequireApproval ? (
        <Text size="sm" className="text-typography-600">
          {t('shifts.day.require_approval_note')}
        </Text>
      ) : null}

      <VStack space="sm">
        {day.CanSignup && !isWorkshift ? (
          <Button onPress={openSignup} isDisabled={isDayLoading || anyBusy} accessibilityHint={t('shifts.signup_panel.hint')} testID="shift-day-signup-button">
            <View>
              <UserPlus size={16} color={colors.textInverse} />
            </View>
            <ButtonText>{t('shifts.signup')}</ButtonText>
          </Button>
        ) : null}
        {canTrade ? (
          <Button variant="outline" onPress={openTrade} isDisabled={anyBusy} testID="shift-day-trade-button">
            <View>
              <Repeat size={16} color={colors.primary} />
            </View>
            <ButtonText>{t('shifts.actions.request_trade')}</ButtonText>
          </Button>
        ) : null}
        {day.MyTradeId ? (
          <Button variant="outline" action="secondary" onPress={() => setPanel('cancel-trade')} isDisabled={anyBusy} testID="shift-day-cancel-trade-button">
            <ButtonText>{t('shifts.actions.cancel_trade')}</ButtonText>
          </Button>
        ) : null}
        {canWithdraw ? (
          <Button variant="outline" action="negative" onPress={() => setPanel('withdraw')} isDisabled={anyBusy} testID="shift-day-withdraw-button">
            <ButtonText>{t('shifts.withdraw')}</ButtonText>
          </Button>
        ) : null}
        {canManageDay ? (
          <Button variant="outline" action="secondary" onPress={openAdd} isDisabled={anyBusy || isDayLoading} testID="shift-day-add-person-button">
            <View>
              <UserPlus size={16} color={colors.primary} />
            </View>
            <ButtonText>{t('shifts.actions.add_person')}</ButtonText>
          </Button>
        ) : null}
      </VStack>

      {needs.length > 0 ? (
        <VStack space="sm">
          <Text className="text-lg font-semibold text-typography-900" accessibilityRole="header">
            {t('shifts.day.open_needs')}
          </Text>
          {needs.map((group) => (
            <GroupNeedsCard key={group.GroupId} group={group} />
          ))}
        </VStack>
      ) : null}

      <VStack space="sm">
        <Text className="text-lg font-semibold text-typography-900" accessibilityRole="header">
          {t('shifts.day.roster')}
        </Text>
        {isRosterLoading ? (
          loadingRow('shift-day-roster-loading')
        ) : rosterGroups.length === 0 ? (
          <Text size="sm" className="py-4 text-typography-500">
            {t('shifts.day.roster_empty')}
          </Text>
        ) : (
          rosterGroups.map((group) => (
            <VStack key={group.key || 'no-group'} space="xs" testID={`roster-group-${group.key || 'none'}`}>
              <Text size="sm" className="font-semibold uppercase text-typography-500">
                {group.name}
              </Text>
              {group.entries.map((entry) => (
                <RosterRow
                  key={`${entry.UserId}-${entry.ShiftSignupId}-${entry.UnitId ?? ''}`}
                  entry={entry}
                  isMe={entry.UserId === userId}
                  canManage={isWorkshift ? false : canManageRosterEntry(day, entry)}
                  onReview={openReview}
                  onRemove={openRemove}
                />
              ))}
            </VStack>
          ))
        )}
      </VStack>
    </VStack>
  );

  const renderSignup = () => (
    <VStack space="md" testID="shift-day-signup-panel">
      <Text className="text-lg font-semibold text-typography-900">{t('shifts.signup_panel.title')}</Text>
      <Text size="sm" className="text-typography-600">
        {t('shifts.signup_panel.description')}
      </Text>
      {needs.length === 0 ? (
        <Text size="sm" className="text-typography-500">
          {t('shifts.signup_panel.no_groups')}
        </Text>
      ) : (
        <VStack space="sm" accessibilityRole="radiogroup">
          {needs.map((group) => {
            const open = getGroupOpenSlots(group);
            return (
              <ShiftSelectRow
                key={group.GroupId}
                id={group.GroupId}
                mode="radio"
                title={group.GroupName}
                subtitle={(group.GroupNeeds ?? []).map((role) => `${role.RoleName}: ${role.Needed}`).join(', ')}
                trailing={open > 0 ? t('shifts.day.group_open', { count: open }) : t('shifts.day.group_filled')}
                selected={signupGroupId === group.GroupId}
                onToggle={setSignupGroupId}
                testID={`signup-group-${group.GroupId}`}
              />
            );
          })}
        </VStack>
      )}
      {day.RequireApproval ? (
        <Text size="sm" className="text-warning-700">
          {t('shifts.signup_panel.approval_notice')}
        </Text>
      ) : null}
      {footer(t('shifts.actions.confirm_signup'), submitSignup, 'signup', !signupGroupId, 'primary', 'shift-day-signup-confirm')}
    </VStack>
  );

  const renderWithdraw = () => (
    <VStack space="md" testID="shift-day-withdraw-panel">
      <Text className="text-lg font-semibold text-typography-900">{t('shifts.withdraw_panel.title')}</Text>
      <Text size="sm" className="text-typography-600">
        {t('shifts.withdraw_panel.description', { date: formatShiftLongDate(day.ShiftDay || day.Start, locale) })}
      </Text>
      {footer(t('shifts.withdraw'), submitWithdraw, 'withdraw', false, 'negative', 'shift-day-withdraw-confirm')}
    </VStack>
  );

  const renderTrade = () => (
    <VStack space="md" testID="shift-day-trade-panel">
      <Text className="text-lg font-semibold text-typography-900">{t('shifts.trade_panel.title')}</Text>
      <Text size="sm" className="text-typography-600">
        {isWorkshift ? t('shifts.trade_panel.open_description_workshift') : t('shifts.trade_panel.open_description')}
      </Text>
      {isWorkshift ? null : (
        <VStack space="sm" accessibilityRole="radiogroup">
          <ShiftSelectRow
            id="open"
            mode="radio"
            title={t('shifts.trade_panel.mode_open')}
            subtitle={isCandidatesLoading ? t('shifts.loading') : t('shifts.trade_panel.mode_open_hint', { count: candidates.length })}
            selected={tradeMode === 'open'}
            onToggle={() => setTradeMode('open')}
            testID="trade-mode-open"
          />
          <ShiftSelectRow
            id="specific"
            mode="radio"
            title={t('shifts.trade_panel.mode_specific')}
            subtitle={t('shifts.trade_panel.mode_specific_hint')}
            selected={tradeMode === 'specific'}
            onToggle={() => setTradeMode('specific')}
            testID="trade-mode-specific"
          />
        </VStack>
      )}
      {tradeMode !== 'specific' || isWorkshift ? null : isCandidatesLoading ? (
        loadingRow('trade-candidates-loading')
      ) : candidates.length === 0 ? (
        <Text size="sm" className="text-typography-500">
          {t('shifts.trade_panel.no_candidates')}
        </Text>
      ) : (
        <VStack space="sm">
          {candidates.map((candidate) => (
            <ShiftSelectRow
              key={candidate.UserId}
              id={candidate.UserId}
              mode="checkbox"
              title={candidate.Name}
              subtitle={personSubtitle(candidate)}
              selected={candidateIds.includes(candidate.UserId)}
              onToggle={(id) => setCandidateIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))}
              testID={`trade-candidate-${candidate.UserId}`}
            />
          ))}
        </VStack>
      )}
      {tradeMode === 'specific' && candidateIds.length > 0 ? (
        <Text size="sm" className="text-typography-600">
          {t('shifts.trade_panel.selected_count', { count: candidateIds.length })}
        </Text>
      ) : null}
      {noteField('shift-day-trade-note')}
      {footer(t('shifts.actions.send_request'), submitTrade, 'request-trade', tradeMode === 'specific' && !isWorkshift && candidateIds.length === 0, 'primary', 'shift-day-trade-confirm')}
    </VStack>
  );

  const renderCancelTrade = () => (
    <VStack space="md" testID="shift-day-cancel-trade-panel">
      <Text className="text-lg font-semibold text-typography-900">{t('shifts.trade.cancel_title')}</Text>
      <Text size="sm" className="text-typography-600">
        {t('shifts.trade.cancel_description')}
      </Text>
      {footer(t('shifts.actions.cancel_trade'), submitCancelTrade, 'cancel-trade', false, 'negative', 'shift-day-cancel-trade-confirm')}
    </VStack>
  );

  const renderAdd = () => (
    <VStack space="md" testID="shift-day-add-panel">
      <Text className="text-lg font-semibold text-typography-900">{t('shifts.add_panel.title')}</Text>
      <Text size="sm" className="font-medium text-typography-700">
        {t('shifts.add_panel.group')}
      </Text>
      <VStack space="sm">
        {manageableGroups.map((group) => {
          const open = getGroupOpenSlots(group);
          return (
            <ShiftSelectRow
              key={group.GroupId}
              id={group.GroupId}
              mode="radio"
              title={group.GroupName}
              trailing={open > 0 ? t('shifts.day.group_open', { count: open }) : t('shifts.day.group_filled')}
              selected={addGroupId === group.GroupId}
              onToggle={setAddGroupId}
              testID={`add-group-${group.GroupId}`}
            />
          );
        })}
      </VStack>
      <Text size="sm" className="font-medium text-typography-700">
        {t('shifts.add_panel.person')}
      </Text>
      <Input variant="outline" size="md">
        <InputField
          value={personSearch}
          onChangeText={setPersonSearch}
          placeholder={t('shifts.add_panel.search_placeholder')}
          accessibilityLabel={t('shifts.add_panel.search_placeholder')}
          testID="shift-day-add-search"
        />
      </Input>
      {isOptionsLoading ? (
        loadingRow('add-options-loading')
      ) : filteredPersonnel.length === 0 ? (
        <Text size="sm" className="text-typography-500">
          {t('shifts.add_panel.no_options')}
        </Text>
      ) : (
        <VStack space="sm">
          {filteredPersonnel.map((option) => (
            <ShiftSelectRow
              key={option.UserId}
              id={option.UserId}
              mode="radio"
              title={option.Name}
              subtitle={personSubtitle(option)}
              selected={addUserId === option.UserId}
              onToggle={setAddUserId}
              testID={`add-person-${option.UserId}`}
            />
          ))}
        </VStack>
      )}
      {footer(t('shifts.add_panel.submit'), submitAdd, 'assign', !addGroupId || !addUserId, 'primary', 'shift-day-add-confirm')}
    </VStack>
  );

  const renderRemove = () => (
    <VStack space="md" testID="shift-day-remove-panel">
      <Text className="text-lg font-semibold text-typography-900">{t('shifts.remove_panel.title', { name: target?.Name ?? '' })}</Text>
      <Text size="sm" className="text-typography-600">
        {t('shifts.remove_panel.description')}
      </Text>
      {noteField('shift-day-remove-note')}
      {footer(t('shifts.actions.remove'), submitRemove, 'remove', !target, 'negative', 'shift-day-remove-confirm')}
    </VStack>
  );

  const renderReview = () => (
    <VStack space="md" testID="shift-day-review-panel">
      <Text className="text-lg font-semibold text-typography-900">{reviewApprove ? t('shifts.review.approve_signup_title') : t('shifts.review.deny_signup_title')}</Text>
      <Text size="sm" className="text-typography-700">
        {target ? [target.Name, target.GroupName].filter((part) => !!part).join(' · ') : ''}
      </Text>
      {noteField('shift-day-review-note')}
      {footer(reviewApprove ? t('shifts.actions.approve') : t('shifts.actions.deny'), submitReview, 'review-signup', !target, reviewApprove ? 'positive' : 'negative', 'shift-day-review-confirm')}
    </VStack>
  );

  const panels: Record<DayPanel, () => React.ReactElement> = {
    details: renderDetails,
    signup: renderSignup,
    withdraw: renderWithdraw,
    trade: renderTrade,
    'cancel-trade': renderCancelTrade,
    add: renderAdd,
    remove: renderRemove,
    review: renderReview,
  };

  return (
    <VStack space="lg" testID="shift-day-details">
      <VStack space="xs">
        <HStack className="items-start justify-between" space="sm">
          <Text className="flex-1 text-2xl font-bold text-typography-900" accessibilityRole="header">
            {day.ShiftName}
          </Text>
          {day.IsActive ? (
            <Badge action="success" size="md" testID="shift-day-active-now">
              <BadgeText>{t('shifts.status.active_now')}</BadgeText>
            </Badge>
          ) : null}
        </HStack>
        <Text className="text-typography-600">{formatShiftLongDate(day.ShiftDay || day.Start, locale)}</Text>
      </VStack>

      <Box className="rounded-lg bg-background-info p-4">
        <HStack className="items-center" space="md">
          <View>
            <Clock size={22} color={colors.info} />
          </View>
          <VStack className="flex-1" space="xs">
            <Text className="font-medium text-typography-900">{t('shifts.scheduled_for')}</Text>
            <Text size="sm" className="text-typography-800" testID="shift-day-hours">
              {`${formatShiftTime(day.Start, locale)} – ${formatShiftTime(day.End, locale)}${overnight ? ` ${t('shifts.overnight')}` : ''}`}
            </Text>
          </VStack>
          <VStack space="xs" className="items-end">
            <Badge action="muted" size="sm">
              <BadgeText>{t(getAssignmentTypeKey(day.ShiftType))}</BadgeText>
            </Badge>
            {isWorkshift ? (
              day.MyUnitName ? (
                <HStack space="xs" className="items-center">
                  <View>
                    <Truck size={12} color={colors.info} />
                  </View>
                  <Text size="xs" className="font-medium text-typography-800">
                    {day.MyUnitName}
                  </Text>
                </HStack>
              ) : null
            ) : (
              <Text size="xs" className={`font-medium ${day.Filled ? 'text-success-700' : 'text-warning-700'}`}>
                {day.Filled ? t('shifts.status.filled') : t('shifts.status.open_slots', { count: day.OpenSlots })}
              </Text>
            )}
          </VStack>
        </HStack>
      </Box>

      {panels[panel]()}
    </VStack>
  );
};
