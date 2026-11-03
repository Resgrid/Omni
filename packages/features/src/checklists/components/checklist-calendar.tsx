import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { toDataError } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CalendarItemResultData } from '@resgrid/models';
import { HStack, Pressable, Spinner, Text, useThemeColors, VStack } from '@resgrid/ui';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { filterCalendarEntries } from '../lib/checklist-filters';
import { checklistErrorKey } from '../lib/checklist-form';
import { fetchChecklistCalendar } from '../lib/checklists-api';

export interface ChecklistCalendarProps {
  /** Opens a scheduled occurrence (the calendar entry's source id). */
  onOpenOccurrence: (occurrenceId: string) => void;
  /** Bumped by the screen to re-read (realtime ping, reveal/conceal). */
  revision?: number;
  /** The screen's search; matches entry titles. */
  query?: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const monthRange = (month: Date): { start: string; end: string } => {
  const y = month.getFullYear();
  const m = month.getMonth() + 1;
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}` };
};

/** Scheduled checks on the department calendar, one month at a time (Responder). Redacted entries show the unlock hint. */
export const ChecklistCalendar: React.FC<ChecklistCalendarProps> = ({ onOpenOccurrence, revision = 0, query = '' }) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [entries, setEntries] = useState<CalendarItemResultData[] | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setErrorKey(null);
    const { start, end } = monthRange(month);
    fetchChecklistCalendar(start, end)
      .then((next) => {
        if (!cancelled) setEntries(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setEntries([]);
          setErrorKey(checklistErrorKey(toDataError(error)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [month, revision]);

  const shown = useMemo(() => (entries ? filterCalendarEntries(entries, query) : null), [entries, query]);
  const step = (by: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));
  const monthLabel = month.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });

  return (
    <View testID="checklist-calendar">
      <HStack className="mb-2 items-center justify-between rounded-lg border border-outline-200 bg-background-0 px-1 py-1" space="sm">
        <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel={t('checklists.ui.previousMonth')} className="rounded-md p-2" testID="checklist-calendar-previous">
          <View>
            <ChevronLeft size={20} color={colors.icon} />
          </View>
        </Pressable>
        <Text className="flex-1 text-center font-semibold text-typography-900" accessibilityRole="header" testID="checklist-calendar-month">
          {monthLabel}
        </Text>
        <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel={t('checklists.ui.nextMonth')} className="rounded-md p-2" testID="checklist-calendar-next">
          <View>
            <ChevronRight size={20} color={colors.icon} />
          </View>
        </Pressable>
      </HStack>
      {errorKey ? (
        <Text accessibilityRole="alert" className="mb-2 text-error-600">
          {t(`checklists.errors.${errorKey}`)}
        </Text>
      ) : null}
      {shown == null ? (
        <View className="py-6">
          <Spinner />
        </View>
      ) : shown.length === 0 && !errorKey ? (
        <Text className="py-6 text-center text-typography-500" testID="checklist-calendar-empty">
          {entries && entries.length > 0 ? t('checklists.ui.noMatches') : t('checklists.ui.noCalendar')}
        </Text>
      ) : (
        shown.map((entry) => {
          const title = entry.IsRedacted ? t('checklists.ui.unlock') : entry.Title;
          const when = formatUtcInDepartmentTime(entry.StartUtc, null, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
          return (
            <Pressable
              key={entry.CalendarItemId}
              disabled={!entry.SourceId}
              onPress={() => (entry.SourceId ? onOpenOccurrence(entry.SourceId) : undefined)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !entry.SourceId }}
              accessibilityLabel={`${title}, ${when}`}
              className="mb-2 rounded-lg border border-outline-200 bg-background-0 p-3"
              testID={`checklist-calendar-entry-${entry.CalendarItemId}`}
            >
              <HStack className="items-center" space="sm">
                {entry.IsRedacted ? (
                  <View>
                    <Lock size={16} color={colors.textMuted} />
                  </View>
                ) : null}
                <VStack className="flex-1">
                  <Text className="font-semibold text-typography-900" numberOfLines={2}>
                    {title}
                  </Text>
                  <Text size="sm" className="text-typography-600">
                    {when}
                  </Text>
                </VStack>
                {entry.SourceId ? (
                  <View>
                    <ChevronRight size={18} color={colors.icon} />
                  </View>
                ) : null}
              </HStack>
            </Pressable>
          );
        })
      )}
    </View>
  );
};
