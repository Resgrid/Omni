import { useNotesStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { htmlToPlainText, ScrollView, Text, View, VStack } from '@resgrid/ui';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { useStale } from '../../hooks/use-stale';
import { useWidgetSettings } from '../../hooks/use-widget-settings-store';
import { useWidgetTitle } from '../../hooks/use-widget-title';
import { selectNotes } from '../../lib/board-data';
import { WidgetTypes } from '../../lib/widget-types';
import { WidgetContainer, WidgetLoading, WidgetMessage } from '../widget-container';
import type { WidgetProps } from './types';

/** Department notes as plain text (server HTML is never rendered in a widget row). */
export const NotesWidget: React.FC<WidgetProps> = ({ isEditMode, onRemove, onConfigure }) => {
  const { t } = useTranslation();
  const title = useWidgetTitle(WidgetTypes.NOTES);
  const notes = useNotesStore((state) => state.notes);
  const isLoading = useNotesStore((state) => state.loading.notes === true);
  const hasError = useNotesStore((state) => !!state.errors.notes);
  const settings = useWidgetSettings('notes');
  const visible = useMemo(() => selectNotes(notes, settings, Date.now()), [notes, settings]);
  const stale = useStale(notes.length > 0, hasError);

  return (
    <WidgetContainer title={title} testID="notes-widget" isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure} stale={stale}>
      {isLoading && notes.length === 0 ? (
        <WidgetLoading testID="notes-widget-loading" />
      ) : hasError && notes.length === 0 ? (
        <WidgetMessage message={t('dashboard.failed_to_load')} tone="error" testID="notes-widget-error" />
      ) : visible.length === 0 ? (
        <WidgetMessage message={t('dashboard.no_notes')} testID="notes-widget-empty" />
      ) : (
        <ScrollView style={styles.fill} nestedScrollEnabled>
          <VStack space="sm">
            {visible.map((note) => (
              <View key={note.NoteId} className="rounded bg-background-50 p-2" testID={`notes-widget-note-${note.NoteId}`}>
                <Text className="text-sm font-semibold text-typography-900" numberOfLines={1}>
                  {note.Title}
                </Text>
                {note.Category ? <Text className="text-xs text-typography-500">{note.Category}</Text> : null}
                {note.Body ? (
                  <Text className="text-xs text-typography-600" numberOfLines={3}>
                    {htmlToPlainText(note.Body)}
                  </Text>
                ) : null}
              </View>
            ))}
          </VStack>
        </ScrollView>
      )}
    </WidgetContainer>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
