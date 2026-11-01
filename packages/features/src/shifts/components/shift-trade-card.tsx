import { useTranslation } from '@resgrid/i18n';
import { ShiftAssignmentType, ShiftTradeDirection, type ShiftTradeResultData, ShiftTradeStatus, type ShiftTradeUserResultData, ShiftTradeUserState } from '@resgrid/models';
import { Badge, BadgeText, Button, ButtonText, HStack, Pressable, Text, useThemeColors, VStack } from '@resgrid/ui';
import { ArrowRightLeft, ChevronRight, Clock, Truck, Users } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import type { ShiftTradeAction } from '../lib/shift-action-types';
import { canCancelTrade, canPickTrade, canRespondToTrade, canWithdrawApplication, getAssignmentTypeKey, getIneligibleReasonKey, getTradeMyStateKey, getTradeStatusLabel } from '../lib/shift-rules';
import { formatShiftDate, formatShiftTime } from '../lib/shift-time';

export interface ShiftTradeOfferRowProps {
  trade: ShiftTradeResultData;
  user: ShiftTradeUserResultData;
  canPick: boolean;
  isBusy: boolean;
  onAction: (action: ShiftTradeAction) => void;
  /** Extra lines under the applicant (qualifications in the trade sheet). */
  children?: React.ReactNode;
}

/** One applicant or invitee: their answer, and for the person who picks, "give to" or a swap-back per offered day. */
export const ShiftTradeOfferRow: React.FC<ShiftTradeOfferRowProps> = ({ trade, user, canPick, isBusy, onAction, children }) => {
  const { t, i18n } = useTranslation();
  const stateText = user.Declined ? (trade.IsOpen ? t('shifts.trade.user_withdrew') : t('shifts.trade.user_declined')) : user.Offered ? t('shifts.trade.user_offered') : t('shifts.trade.user_waiting');
  const details = [user.GroupName, (user.Roles ?? []).join(', ')].filter((part) => !!part).join(' · ');
  const offered = user.OfferedShifts ?? [];
  return (
    <VStack className="rounded-md bg-background-50 p-2" testID={`trade-user-${trade.ShiftSignupTradeId}-${user.UserId}`}>
      <HStack className="items-center justify-between">
        <Text size="sm" className="font-medium text-typography-900">
          {user.Name}
        </Text>
        <Text size="xs" className={user.Declined ? 'text-error-600' : user.Offered ? 'text-success-700' : 'text-typography-500'}>
          {stateText}
        </Text>
      </HStack>
      {details ? (
        <Text size="xs" className="text-typography-600">
          {details}
        </Text>
      ) : null}
      {user.Reason ? (
        <Text size="xs" className="italic text-typography-600">
          {user.Reason}
        </Text>
      ) : null}
      {children}
      {canPick && user.Offered && !user.Declined ? (
        offered.length === 0 ? (
          <Button
            size="sm"
            variant="outline"
            onPress={() => onAction({ kind: 'finish-trade', trade, user, offeredShift: null })}
            isDisabled={isBusy}
            className="mt-1 self-start"
            testID={`trade-pick-${trade.ShiftSignupTradeId}-${user.UserId}`}
          >
            <ButtonText>{t('shifts.trade.give_to', { name: user.Name })}</ButtonText>
          </Button>
        ) : (
          offered.map((shift) => (
            <Button
              key={shift.ShiftSignupId}
              size="sm"
              variant="outline"
              onPress={() => onAction({ kind: 'finish-trade', trade, user, offeredShift: shift })}
              isDisabled={isBusy}
              className="mt-1 self-start"
              testID={`trade-pick-${trade.ShiftSignupTradeId}-${user.UserId}-${shift.ShiftSignupId}`}
            >
              <ButtonText>{t('shifts.trade.swap_for', { shift: shift.ShiftName, date: formatShiftDate(shift.ShiftDay, i18n.language) })}</ButtonText>
            </Button>
          ))
        )
      ) : null}
    </VStack>
  );
};

export interface ShiftTradeActionButtonsProps {
  trade: ShiftTradeResultData;
  isBusy: boolean;
  onAction: (action: ShiftTradeAction) => void;
  testPrefix?: string;
}

/** Accept/decline (targeted), apply/withdraw (open), approve/deny (reviewer) and cancel — whatever the caller may do now. */
export const ShiftTradeActionButtons: React.FC<ShiftTradeActionButtonsProps> = ({ trade, isBusy, onAction, testPrefix = 'trade' }) => {
  const { t } = useTranslation();
  const id = trade.ShiftSignupTradeId;
  const isIncoming = trade.Direction === ShiftTradeDirection.Incoming;
  const canRespond = canRespondToTrade(trade);
  const canApply = trade.CanApply === true;
  const canWithdraw = canWithdrawApplication(trade);
  const canCancel = canCancelTrade(trade);
  if (!canRespond && !canApply && !canWithdraw && !canCancel && !trade.CanReview) return null;
  return (
    <HStack space="sm" className="mt-1 flex-wrap">
      {canRespond ? (
        <>
          <Button size="sm" action="positive" onPress={() => onAction({ kind: 'accept-trade', trade })} isDisabled={isBusy} className="mb-1" testID={`${testPrefix}-accept-${id}`}>
            <ButtonText>{t('shifts.actions.accept')}</ButtonText>
          </Button>
          <Button size="sm" action="negative" variant="outline" onPress={() => onAction({ kind: 'decline-trade', trade })} isDisabled={isBusy} className="mb-1" testID={`${testPrefix}-decline-${id}`}>
            <ButtonText>{t('shifts.actions.decline')}</ButtonText>
          </Button>
        </>
      ) : null}
      {canApply ? (
        <Button size="sm" action="positive" onPress={() => onAction({ kind: 'apply-trade', trade })} isDisabled={isBusy} className="mb-1" testID={`${testPrefix}-apply-${id}`}>
          <ButtonText>{t('shifts.actions.apply')}</ButtonText>
        </Button>
      ) : null}
      {canWithdraw ? (
        <Button size="sm" action="secondary" variant="outline" onPress={() => onAction({ kind: 'withdraw-application', trade })} isDisabled={isBusy} className="mb-1" testID={`${testPrefix}-withdraw-${id}`}>
          <ButtonText>{t('shifts.actions.withdraw_application')}</ButtonText>
        </Button>
      ) : null}
      {trade.CanReview ? (
        <>
          <Button size="sm" action="positive" onPress={() => onAction({ kind: 'review-trade', trade, approve: true })} isDisabled={isBusy} className="mb-1" testID={`${testPrefix}-approve-${id}`}>
            <ButtonText>{t('shifts.actions.approve')}</ButtonText>
          </Button>
          <Button size="sm" action="negative" variant="outline" onPress={() => onAction({ kind: 'review-trade', trade, approve: false })} isDisabled={isBusy} className="mb-1" testID={`${testPrefix}-deny-${id}`}>
            <ButtonText>{t('shifts.actions.deny')}</ButtonText>
          </Button>
        </>
      ) : null}
      {canCancel ? (
        <Button size="sm" action="secondary" variant="outline" onPress={() => onAction({ kind: 'cancel-trade', trade })} isDisabled={isBusy} className="mb-1" testID={`${testPrefix}-cancel-${id}`}>
          <ButtonText>{isIncoming ? t('shifts.actions.cancel_request_admin') : t('shifts.actions.cancel_trade')}</ButtonText>
        </Button>
      ) : null}
    </HStack>
  );
};

export interface ShiftTradeCardProps {
  trade: ShiftTradeResultData;
  onAction: (action: ShiftTradeAction) => void;
  /** Opens the trade with its applicants' qualifications. */
  onOpenDetails?: (trade: ShiftTradeResultData) => void;
  /** Busy while a mutation on this trade runs. */
  isBusy?: boolean;
}

/** A trade request: which day, who asked, its state, the applicants (for whoever picks) and the caller's actions. */
export const ShiftTradeCard: React.FC<ShiftTradeCardProps> = React.memo(({ trade, onAction, onOpenDetails, isBusy = false }) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const locale = i18n.language;
  const id = trade.ShiftSignupTradeId;
  const isIncoming = trade.Direction === ShiftTradeDirection.Incoming;
  const status = getTradeStatusLabel(trade.Status);
  const isOpenStatus = trade.Status === ShiftTradeStatus.Open;
  const canPick = canPickTrade(trade);
  const isWorkshift = trade.ShiftType === ShiftAssignmentType.Workshift;
  const ineligibleKey = trade.IsOpen && isIncoming && !trade.CanApply && !canWithdrawApplication(trade) && isOpenStatus ? getIneligibleReasonKey(trade.IneligibleReason) : null;
  const users = trade.Users ?? [];
  const applicantCount = trade.ApplicantCount ?? users.filter((user) => user.Offered && !user.Declined).length;
  const showOffers = isOpenStatus && (canPick || !isIncoming);
  const date = formatShiftDate(trade.ShiftDay || trade.Start, locale);

  const header = (
    <HStack className="items-start justify-between" space="sm">
      <VStack className="flex-1" space="xs">
        <Text className="font-semibold text-typography-900">{trade.ShiftName}</Text>
        <Text size="sm" className="text-typography-600">
          {date}
        </Text>
      </VStack>
      <VStack space="xs" className="items-end">
        <Badge action={isIncoming ? 'info' : 'muted'} size="sm">
          <BadgeText>{isIncoming ? t('shifts.trade.incoming') : t('shifts.trade.outgoing')}</BadgeText>
        </Badge>
        <Badge action={status.action} size="sm" testID={`trade-status-${id}`}>
          <BadgeText>{t(status.key)}</BadgeText>
        </Badge>
      </VStack>
    </HStack>
  );

  return (
    <VStack space="sm" className="mb-3 rounded-xl border border-outline-100 bg-background-0 p-4" testID={`trade-card-${id}`}>
      {onOpenDetails ? (
        <Pressable
          onPress={() => onOpenDetails(trade)}
          accessibilityRole="button"
          accessibilityLabel={t('shifts.trade.details_a11y', { shift: trade.ShiftName, date })}
          accessibilityHint={t('shifts.trade.details_hint')}
          testID={`trade-open-${id}`}
        >
          <HStack className="items-center" space="xs">
            <VStack className="flex-1">{header}</VStack>
            <View>
              <ChevronRight size={18} color={colors.icon} />
            </View>
          </HStack>
        </Pressable>
      ) : (
        header
      )}

      <HStack space="sm" className="items-center">
        <View>
          <Clock size={14} color={colors.icon} />
        </View>
        <Text size="sm" className="flex-1 text-typography-700">
          {`${formatShiftTime(trade.Start, locale)} – ${formatShiftTime(trade.End, locale)}${trade.GroupName ? ` · ${trade.GroupName}` : ''}`}
        </Text>
      </HStack>

      {isWorkshift && trade.UnitName ? (
        <HStack space="sm" className="items-center">
          <View>
            <Truck size={14} color={colors.icon} />
          </View>
          <Text size="sm" className="text-typography-700">
            {trade.UnitName}
          </Text>
        </HStack>
      ) : null}

      <HStack className="flex-wrap">
        <Badge action="muted" size="sm" className="mb-1 mr-1">
          <BadgeText>{t(getAssignmentTypeKey(trade.ShiftType ?? ShiftAssignmentType.Assigned))}</BadgeText>
        </Badge>
        {trade.IsOpen ? (
          <Badge action="info" size="sm" className="mb-1 mr-1" testID={`trade-open-request-${id}`}>
            <BadgeText>{t('shifts.trade.open_request')}</BadgeText>
          </Badge>
        ) : null}
      </HStack>

      {isIncoming ? (
        <Text size="sm" className="text-typography-700">
          {t('shifts.trade.from', { name: trade.SourceUserName })}
        </Text>
      ) : null}
      {isIncoming && (!trade.IsOpen || trade.MyState !== ShiftTradeUserState.Open) ? (
        <Text size="sm" className="font-medium text-typography-900" testID={`trade-my-state-${id}`}>
          {t(getTradeMyStateKey(trade.MyState))}
        </Text>
      ) : null}

      {trade.IsOpen && isOpenStatus ? (
        <HStack space="xs" className="items-center">
          <View>
            <Users size={14} color={colors.icon} />
          </View>
          <Text size="sm" className="text-typography-700" testID={`trade-applicants-${id}`}>
            {t('shifts.trade.applicant_count', { count: applicantCount })}
          </Text>
        </HStack>
      ) : null}

      {trade.Note ? (
        <Text size="sm" className="italic text-typography-600">
          {`${t('shifts.note_label')}: ${trade.Note}`}
        </Text>
      ) : null}

      {trade.AcceptedUserName ? (
        <HStack space="xs" className="items-center">
          <View>
            <ArrowRightLeft size={14} color={colors.icon} />
          </View>
          <Text size="sm" className="text-typography-700">
            {`${t('shifts.trade.taken_by', { name: trade.AcceptedUserName })}${trade.TargetShiftDay ? ` · ${t('shifts.trade.swap_back', { date: formatShiftDate(trade.TargetShiftDay, locale) })}` : ''}`}
          </Text>
        </HStack>
      ) : null}

      {trade.ReviewedByName ? (
        <Text size="xs" className="text-typography-500">
          {`${t('shifts.trade.reviewed_by', { name: trade.ReviewedByName })}${trade.ReviewNote ? ` · ${trade.ReviewNote}` : ''}`}
        </Text>
      ) : null}

      {ineligibleKey ? (
        <Text size="sm" className="text-warning-700" testID={`trade-ineligible-${id}`}>
          {t(ineligibleKey)}
        </Text>
      ) : null}

      {showOffers ? (
        <VStack space="xs">
          <Text size="sm" className="font-semibold text-typography-900">
            {trade.IsOpen ? t('shifts.trade.applicants') : t('shifts.trade.offers')}
          </Text>
          {users.length === 0 ? (
            <Text size="sm" className="text-typography-500">
              {trade.IsOpen ? t('shifts.trade.no_applicants') : t('shifts.trade.no_offers')}
            </Text>
          ) : (
            users.map((user) => <ShiftTradeOfferRow key={user.UserId} trade={trade} user={user} canPick={canPick} isBusy={isBusy} onAction={onAction} />)
          )}
          {canPick && trade.PickIsApproval ? (
            <Text size="xs" className="text-typography-500">
              {t('shifts.trade.pick_as_approver_note')}
            </Text>
          ) : null}
        </VStack>
      ) : null}

      {trade.Status === ShiftTradeStatus.PendingApproval && !trade.CanReview ? (
        <Text size="sm" className="text-warning-700">
          {t('shifts.trade.finish_pending_note')}
        </Text>
      ) : null}

      <ShiftTradeActionButtons trade={trade} isBusy={isBusy} onAction={onAction} />
    </VStack>
  );
});

ShiftTradeCard.displayName = 'ShiftTradeCard';
