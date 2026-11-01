import { useShiftsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { ShiftTradeDirection, type ShiftTradeResultData, ShiftTradeStatus, type ShiftTradeUserResultData } from '@resgrid/models';
import { Badge, BadgeText, HStack, Spinner, Text, VStack } from '@resgrid/ui';
import React, { useEffect } from 'react';

import type { ShiftTradeAction } from '../lib/shift-action-types';
import { canPickTrade, getIneligibleReasonKey, getTradeMyStateKey, getTradeStatusLabel } from '../lib/shift-rules';
import { formatShiftDate, formatShiftTime } from '../lib/shift-time';
import { ShiftTradeActionButtons, ShiftTradeOfferRow } from './shift-trade-card';

const ApplicantQualifications: React.FC<{ user: ShiftTradeUserResultData }> = ({ user }) => {
  const { t } = useTranslation();
  // Only GetShiftTrade fills these, and only for the requester and the people who decide.
  if (user.IsEligible === undefined) return null;
  const ineligibleKey = user.IsEligible === false ? getIneligibleReasonKey(user.IneligibleReason) : null;
  const certifications = user.Certifications ?? [];
  return (
    <VStack space="xs" className="mt-1">
      <Text size="xs" className="text-typography-700" testID={`trade-applicant-certs-${user.UserId}`}>
        {certifications.length > 0 ? certifications.join(', ') : t('shifts.trade.no_certifications')}
      </Text>
      <Text size="xs" className="text-typography-700" testID={`trade-applicant-workload-${user.UserId}`}>
        {t('shifts.trade.nearby_workload', { count: user.NearbyShiftCount ?? 0, hours: user.NearbyShiftHours ?? 0 })}
      </Text>
      {user.HasConflict ? (
        <Text size="xs" className="text-warning-700" testID={`trade-applicant-conflict-${user.UserId}`}>
          {t('shifts.trade.applicant_conflict', { name: user.ConflictName ?? '' })}
        </Text>
      ) : null}
      {ineligibleKey ? (
        <Text size="xs" className="text-warning-700" testID={`trade-applicant-ineligible-${user.UserId}`}>
          {t(ineligibleKey)}
        </Text>
      ) : null}
    </VStack>
  );
};

export interface ShiftTradeDetailsProps {
  tradeId: string;
  /** The list copy, shown at once while the detail (applicant qualifications) loads. */
  fallback?: ShiftTradeResultData | null;
  onAction: (action: ShiftTradeAction) => void;
}

/** One trade with everything the people who decide need to choose between applicants. */
export const ShiftTradeDetails: React.FC<ShiftTradeDetailsProps> = ({ tradeId, fallback = null, onAction }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const loaded = useShiftsStore((state) => state.tradesById[tradeId]);
  const isLoading = useShiftsStore((state) => state.loading.trade === true);

  useEffect(() => {
    if (tradeId) void useShiftsStore.getState().fetchTradeDetail(tradeId);
  }, [tradeId]);

  const trade = loaded ?? fallback;
  if (!trade) {
    return isLoading ? (
      <HStack space="sm" className="items-center justify-center py-8" testID="shift-trade-loading">
        <Spinner size="small" />
        <Text size="sm" className="text-typography-500">
          {t('shifts.loading_details')}
        </Text>
      </HStack>
    ) : (
      <Text size="sm" className="py-8 text-center text-typography-500" testID="shift-trade-missing">
        {t('shifts.errors.not_found')}
      </Text>
    );
  }

  const status = getTradeStatusLabel(trade.Status);
  const isIncoming = trade.Direction === ShiftTradeDirection.Incoming;
  const canPick = canPickTrade(trade) && trade.Status === ShiftTradeStatus.Open;
  const users = trade.Users ?? [];
  const showApplicants = canPick || !isIncoming;

  return (
    <VStack space="md" testID="shift-trade-details">
      <VStack space="xs">
        <HStack className="items-start justify-between" space="sm">
          <Text className="flex-1 text-2xl font-bold text-typography-900" accessibilityRole="header">
            {trade.ShiftName}
          </Text>
          <Badge action={status.action} size="md">
            <BadgeText>{t(status.key)}</BadgeText>
          </Badge>
        </HStack>
        <Text className="text-typography-600">{`${formatShiftDate(trade.ShiftDay || trade.Start, locale)} · ${formatShiftTime(trade.Start, locale)} – ${formatShiftTime(trade.End, locale)}`}</Text>
        {trade.GroupName || trade.UnitName ? (
          <Text size="sm" className="text-typography-600">
            {[trade.GroupName, trade.UnitName].filter((part) => !!part).join(' · ')}
          </Text>
        ) : null}
      </VStack>

      <Text size="sm" className="text-typography-700">
        {t('shifts.trade.requested_by', { name: trade.SourceUserName })}
      </Text>
      {isIncoming ? (
        <Text size="sm" className="font-medium text-typography-900">
          {t(getTradeMyStateKey(trade.MyState))}
        </Text>
      ) : null}
      {trade.Note ? (
        <Text size="sm" className="italic text-typography-600">
          {`${t('shifts.note_label')}: ${trade.Note}`}
        </Text>
      ) : null}
      {trade.AcceptedUserName ? (
        <Text size="sm" className="text-typography-700">
          {t('shifts.trade.taken_by', { name: trade.AcceptedUserName })}
        </Text>
      ) : null}

      {showApplicants ? (
        <VStack space="sm">
          <Text className="font-semibold text-typography-900">{trade.IsOpen ? t('shifts.trade.applicants') : t('shifts.trade.offers')}</Text>
          {users.length === 0 ? (
            <Text size="sm" className="text-typography-500">
              {trade.IsOpen ? t('shifts.trade.no_applicants') : t('shifts.trade.no_offers')}
            </Text>
          ) : (
            users.map((user) => (
              <ShiftTradeOfferRow key={user.UserId} trade={trade} user={user} canPick={canPick} isBusy={false} onAction={onAction}>
                <ApplicantQualifications user={user} />
              </ShiftTradeOfferRow>
            ))
          )}
          {canPick ? (
            <Text size="xs" className="text-typography-500" testID="trade-detail-pick-note">
              {trade.PickIsApproval ? t('shifts.trade.pick_as_approver_note') : t('shifts.trade.pick_note')}
            </Text>
          ) : null}
        </VStack>
      ) : null}

      <ShiftTradeActionButtons trade={trade} isBusy={false} onAction={onAction} testPrefix="trade-detail" />
    </VStack>
  );
};
