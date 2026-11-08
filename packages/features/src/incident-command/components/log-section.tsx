import { formatUtcInDepartmentTime, parseUtcMs } from '@resgrid/core/utils/dates';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import type { CommandLogEntry } from '@resgrid/models';
import { ScrollView, Text, VStack } from '@resgrid/ui';
import { ScrollText } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { BoardButton } from './board-buttons';
import { SectionCard, SectionEmpty } from './section-card';

/** Newest first; entries with an unparseable time sink to the end. */
export const sortLogEntries = (entries: readonly CommandLogEntry[]): CommandLogEntry[] => [...entries].sort((a, b) => (parseUtcMs(b.OccurredOn) ?? 0) - (parseUtcMs(a.OccurredOn) ?? 0));

export const LogEntryRow: React.FC<{ entry: CommandLogEntry; testID?: string }> = ({ entry, testID }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();

  return (
    <View style={styles.entry} className="border-l-4 border-primary-500" testID={testID}>
      <Text className="text-sm text-typography-900">{entry.Description || t('incident_command.log_entry')}</Text>
      <Text className="text-xs text-typography-500">{formatUtcInDepartmentTime(entry.OccurredOn, timeZone)}</Text>
    </View>
  );
};

export interface LogSectionProps {
  entries: CommandLogEntry[];
  /** How many recent entries the board shows. */
  limit?: number;
  /** Tallest the entry list gets; past it the list scrolls inside the card (the board's log). Omitted = full height. */
  maxHeight?: number;
  onOpenFullLog?: () => void;
  testID?: string;
}

/**
 * The latest incident log (ICS-201 timeline) entries, with a link to the full searchable log (IC timeline section). With
 * `maxHeight` the list scrolls inside the card, so a long log never pushes the board down.
 */
export const LogSection: React.FC<LogSectionProps> = ({ entries, limit = 8, maxHeight, onOpenFullLog, testID = 'command-log-section' }) => {
  const { t } = useTranslation();
  const recent = useMemo(() => sortLogEntries(entries).slice(0, limit), [entries, limit]);

  const list = (
    <VStack space="xs">
      {recent.map((entry) => (
        <LogEntryRow key={entry.CommandLogEntryId} entry={entry} testID={`${testID}-entry-${entry.CommandLogEntryId}`} />
      ))}
    </VStack>
  );

  return (
    <SectionCard
      title={t('incident_command.log')}
      icon={ScrollText}
      count={entries.length}
      action={onOpenFullLog ? <BoardButton label={t('incident_command.open_full_log')} variant="link" onPress={onOpenFullLog} testID={`${testID}-open`} /> : undefined}
      testID={testID}
    >
      {recent.length === 0 ? (
        <SectionEmpty text={t('incident_command.no_log')} />
      ) : maxHeight ? (
        // Nested in the board's page scroll: Android needs nestedScrollEnabled to scroll the inner list.
        <ScrollView style={StyleSheet.flatten([styles.scroll, { maxHeight }])} nestedScrollEnabled showsVerticalScrollIndicator testID={`${testID}-scroll`}>
          {list}
        </ScrollView>
      ) : (
        list
      )}
    </SectionCard>
  );
};

const styles = StyleSheet.create({
  entry: { paddingLeft: 10, paddingVertical: 4 },
  // As tall as its entries up to maxHeight; never grows into the card's free space.
  scroll: { flexGrow: 0 },
});
