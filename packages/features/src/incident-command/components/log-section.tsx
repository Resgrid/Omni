import { formatUtcInDepartmentTime, parseUtcMs } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import type { CommandLogEntry } from '@resgrid/models';
import { Text, VStack } from '@resgrid/ui';
import { ScrollText } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { BoardButton } from './board-buttons';
import { SectionCard, SectionEmpty } from './section-card';

/** Newest first; entries with an unparseable time sink to the end. */
export const sortLogEntries = (entries: readonly CommandLogEntry[]): CommandLogEntry[] => [...entries].sort((a, b) => (parseUtcMs(b.OccurredOn) ?? 0) - (parseUtcMs(a.OccurredOn) ?? 0));

export const LogEntryRow: React.FC<{ entry: CommandLogEntry; testID?: string }> = ({ entry, testID }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.entry} className="border-l-4 border-primary-500" testID={testID}>
      <Text className="text-sm text-typography-900">{entry.Description || t('incident_command.log_entry')}</Text>
      <Text className="text-xs text-typography-500">{formatUtcInDepartmentTime(entry.OccurredOn, null)}</Text>
    </View>
  );
};

export interface LogSectionProps {
  entries: CommandLogEntry[];
  /** How many recent entries the board shows. */
  limit?: number;
  onOpenFullLog?: () => void;
  testID?: string;
}

/** The latest incident log (ICS-201 timeline) entries, with a link to the full searchable log (IC timeline section). */
export const LogSection: React.FC<LogSectionProps> = ({ entries, limit = 8, onOpenFullLog, testID = 'command-log-section' }) => {
  const { t } = useTranslation();
  const recent = useMemo(() => sortLogEntries(entries).slice(0, limit), [entries, limit]);
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
      ) : (
        <VStack space="xs">
          {recent.map((entry) => (
            <LogEntryRow key={entry.CommandLogEntryId} entry={entry} testID={`${testID}-entry-${entry.CommandLogEntryId}`} />
          ))}
        </VStack>
      )}
    </SectionCard>
  );
};

const styles = StyleSheet.create({
  entry: { paddingLeft: 10, paddingVertical: 4 },
});
