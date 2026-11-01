import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import type { OnDutyPersonResultData, PendingShiftSignupResultData, ShiftTradeResultData } from '@resgrid/models';
import { Badge, BadgeText, Button, ButtonText, FlatList, HStack, Pressable, RefreshControl, Text, VStack, ZeroState } from '@resgrid/ui';
import { ArrowRightLeft, CalendarCheck, UserCheck } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import type { ShiftSheetAction, ShiftTradeAction } from '../lib/shift-action-types';
import { getRosterSourceLabel, sectionMyTrades, sectionOpenTrades } from '../lib/shift-rules';
import { formatShiftDate, formatShiftTime } from '../lib/shift-time';
import { ShiftTradeCard } from './shift-trade-card';

type Row<T> = { type: 'header'; key: string; title: string; subtitle?: string; count?: number } | { type: 'item'; key: string; item: T };

const keyOf = <T,>(row: Row<T>): string => row.key;

const SectionHeader: React.FC<{ title: string; subtitle?: string; trailing?: string }> = ({ title, subtitle, trailing }) => (
  <HStack className="mb-2 mt-3 items-center justify-between">
    <VStack className="flex-1">
      <Text size="sm" className="font-semibold uppercase text-typography-500" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text size="xs" className="text-typography-500">
          {subtitle}
        </Text>
      ) : null}
    </VStack>
    {trailing ? (
      <Text size="sm" className="text-typography-700">
        {trailing}
      </Text>
    ) : null}
  </HStack>
);

// ── Trades ─────────────────────────────────────────────────────────

export type ShiftTradesFilter = 'open' | 'mine';

export interface ShiftTradesListProps {
  trades: readonly ShiftTradeResultData[];
  openTrades: readonly ShiftTradeResultData[];
  filter: ShiftTradesFilter;
  onFilterChange: (filter: ShiftTradesFilter) => void;
  isLoading: boolean;
  onRefresh: () => void;
  onAction: (action: ShiftTradeAction) => void;
  onOpenDetails: (trade: ShiftTradeResultData) => void;
}

/** Open requests in the department (what I can take first) or my own trades (what needs me first). */
export const ShiftTradesList: React.FC<ShiftTradesListProps> = ({ trades, openTrades, filter, onFilterChange, isLoading, onRefresh, onAction, onOpenDetails }) => {
  const { t } = useTranslation();
  const rows = useMemo<Row<ShiftTradeResultData>[]>(
    () =>
      (filter === 'open' ? sectionOpenTrades(openTrades) : sectionMyTrades(trades)).flatMap((section) => [
        { type: 'header' as const, key: `header-${section.key}`, title: t(section.titleKey) },
        ...section.items.map((trade) => ({ type: 'item' as const, key: `trade-${trade.ShiftSignupTradeId}`, item: trade })),
      ]),
    [filter, openTrades, trades, t]
  );

  const chip = (value: ShiftTradesFilter, label: string) => {
    const isActive = filter === value;
    return (
      <Pressable
        onPress={() => onFilterChange(value)}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        testID={`trades-filter-${value}`}
        className={`mr-2 rounded-full border px-3 py-1.5 ${isActive ? 'border-primary-600 bg-primary-100' : 'border-outline-300 bg-background-0'}`}
      >
        <Text size="xs" className={`font-medium ${isActive ? 'text-primary-700' : 'text-typography-700'}`}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={keyOf}
      renderItem={({ item: row }: { item: Row<ShiftTradeResultData> }) =>
        row.type === 'header' ? <SectionHeader title={row.title} /> : <ShiftTradeCard trade={row.item} onAction={onAction} onOpenDetails={onOpenDetails} />
      }
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <HStack className="pb-2 pt-1" accessibilityRole="tablist">
          {chip('open', t('shifts.trade.filter_open', { count: openTrades.length }))}
          {chip('mine', t('shifts.trade.filter_mine', { count: trades.length }))}
        </HStack>
      }
      ListEmptyComponent={
        filter === 'open' ? (
          <ZeroState icon={ArrowRightLeft} heading={t('shifts.empty.open_trades_title')} description={t('shifts.empty.open_trades_description')} testID="shift-trades-empty" />
        ) : (
          <ZeroState icon={ArrowRightLeft} heading={t('shifts.empty.trades_title')} description={t('shifts.empty.trades_description')} testID="shift-trades-empty" />
        )
      }
      testID="shift-trades-list"
    />
  );
};

// ── Approvals ──────────────────────────────────────────────────────

export interface ShiftApprovalsListProps {
  signups: readonly PendingShiftSignupResultData[];
  trades: readonly ShiftTradeResultData[];
  isLoading: boolean;
  onRefresh: () => void;
  onAction: (action: ShiftSheetAction) => void;
  onOpenTradeDetails: (trade: ShiftTradeResultData) => void;
}

const PendingSignupCard: React.FC<{ signup: PendingShiftSignupResultData; onAction: (action: ShiftSheetAction) => void }> = ({ signup, onAction }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const roles = (signup.Roles ?? []).join(', ');
  const requested = formatUtcInDepartmentTime(signup.SignupTimestamp, null, { dateStyle: 'medium', timeStyle: 'short' }, locale);
  return (
    <VStack space="xs" className="mb-3 rounded-xl border border-outline-100 bg-background-0 p-4" testID={`pending-signup-${signup.ShiftSignupId}`}>
      <Text className="font-semibold text-typography-900">{signup.UserName}</Text>
      <Text size="sm" className="text-typography-700">
        {[signup.ShiftName, signup.GroupName].filter((part) => !!part).join(' · ')}
      </Text>
      <Text size="sm" className="text-typography-600">
        {`${formatShiftDate(signup.ShiftDay || signup.Start, locale)} · ${formatShiftTime(signup.Start, locale)} – ${formatShiftTime(signup.End, locale)}`}
      </Text>
      {roles ? (
        <Text size="xs" className="text-typography-600">
          {roles}
        </Text>
      ) : null}
      {requested ? (
        <Text size="xs" className="text-typography-500">
          {t('shifts.review.requested_at', { date: requested })}
        </Text>
      ) : null}
      <HStack space="sm" className="mt-2">
        <Button size="sm" action="positive" onPress={() => onAction({ kind: 'review-signup', signup, approve: true })} testID={`signup-approve-${signup.ShiftSignupId}`}>
          <ButtonText>{t('shifts.actions.approve')}</ButtonText>
        </Button>
        <Button size="sm" action="negative" variant="outline" onPress={() => onAction({ kind: 'review-signup', signup, approve: false })} testID={`signup-deny-${signup.ShiftSignupId}`}>
          <ButtonText>{t('shifts.actions.deny')}</ButtonText>
        </Button>
      </HStack>
    </VStack>
  );
};

type ApprovalItem = { kind: 'signup'; signup: PendingShiftSignupResultData } | { kind: 'trade'; trade: ShiftTradeResultData };

/** Supervisors: sign-ups and trades waiting for approval in the groups they supervise. */
export const ShiftApprovalsList: React.FC<ShiftApprovalsListProps> = ({ signups, trades, isLoading, onRefresh, onAction, onOpenTradeDetails }) => {
  const { t } = useTranslation();
  const rows = useMemo<Row<ApprovalItem>[]>(() => {
    const list: Row<ApprovalItem>[] = [];
    if (signups.length > 0) {
      list.push({ type: 'header', key: 'header-signups', title: t('shifts.approvals.signups') });
      signups.forEach((signup) => list.push({ type: 'item', key: `signup-${signup.ShiftSignupId}`, item: { kind: 'signup', signup } }));
    }
    if (trades.length > 0) {
      list.push({ type: 'header', key: 'header-trades', title: t('shifts.approvals.trades') });
      trades.forEach((trade) => list.push({ type: 'item', key: `trade-${trade.ShiftSignupTradeId}`, item: { kind: 'trade', trade } }));
    }
    return list;
  }, [signups, trades, t]);

  return (
    <FlatList
      data={rows}
      keyExtractor={keyOf}
      renderItem={({ item: row }: { item: Row<ApprovalItem> }) =>
        row.type === 'header' ? (
          <SectionHeader title={row.title} />
        ) : row.item.kind === 'signup' ? (
          <PendingSignupCard signup={row.item.signup} onAction={onAction} />
        ) : (
          <ShiftTradeCard trade={row.item.trade} onAction={onAction} onOpenDetails={onOpenTradeDetails} />
        )
      }
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
      ListEmptyComponent={<ZeroState icon={CalendarCheck} heading={t('shifts.empty.approvals_title')} description={t('shifts.empty.approvals_description')} testID="shift-approvals-empty" />}
      testID="shift-approvals-list"
    />
  );
};

// ── On duty ────────────────────────────────────────────────────────

export interface ShiftOnDutyListProps {
  personnel: readonly OnDutyPersonResultData[];
  isLoading: boolean;
  onRefresh: () => void;
}

/** Everyone on duty now, grouped by running shift day so each shift reads as one block. */
export const ShiftOnDutyList: React.FC<ShiftOnDutyListProps> = ({ personnel, isLoading, onRefresh }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const rows = useMemo<Row<OnDutyPersonResultData>[]>(() => {
    const byDay = new Map<string, OnDutyPersonResultData[]>();
    personnel.forEach((person) => {
      const key = person.ShiftDayId || person.ShiftId;
      byDay.set(key, [...(byDay.get(key) ?? []), person]);
    });
    const list: Row<OnDutyPersonResultData>[] = [];
    byDay.forEach((people, key) => {
      const first = people[0];
      if (!first) return;
      list.push({ type: 'header', key: `header-${key}`, title: first.ShiftName, subtitle: `${formatShiftTime(first.Start, locale)} – ${formatShiftTime(first.End, locale)}`, count: people.length });
      people.forEach((person) => list.push({ type: 'item', key: `person-${key}-${person.UserId}`, item: person }));
    });
    return list;
  }, [personnel, locale]);

  return (
    <FlatList
      data={rows}
      keyExtractor={keyOf}
      renderItem={({ item: row }: { item: Row<OnDutyPersonResultData> }) => {
        if (row.type === 'header') return <SectionHeader title={row.title} subtitle={row.subtitle} trailing={t('shifts.on_duty.count', { count: row.count ?? 0 })} />;
        const person = row.item;
        const source = getRosterSourceLabel(person.Source);
        const details = [person.GroupName, (person.Roles ?? []).join(', ')].filter((part) => !!part).join(' · ');
        return (
          <HStack className="mb-2 items-center justify-between rounded-lg border border-outline-100 bg-background-0 p-3" space="sm" testID={`on-duty-${person.ShiftDayId}-${person.UserId}`}>
            <VStack className="flex-1">
              <Text size="sm" className="font-semibold text-typography-900">
                {person.Name}
              </Text>
              {details ? (
                <Text size="xs" className="text-typography-600">
                  {details}
                </Text>
              ) : null}
              <Text size="xs" className="text-typography-500">
                {t('shifts.on_duty.until', { time: formatShiftTime(person.End, locale) })}
              </Text>
            </VStack>
            <Badge action={source.action} size="sm">
              <BadgeText>{t(source.key)}</BadgeText>
            </Badge>
          </HStack>
        );
      }}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
      ListEmptyComponent={<ZeroState icon={UserCheck} heading={t('shifts.empty.on_duty_title')} description={t('shifts.empty.on_duty_description')} testID="shift-on-duty-empty" />}
      testID="shift-on-duty-list"
    />
  );
};

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 24 },
});
