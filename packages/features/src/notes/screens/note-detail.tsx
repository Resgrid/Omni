import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useNotesStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import { HtmlRenderer, Loading, ScreenHeader, ScrollView, Text, View, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { StickyNote } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { noteRoutes } from '../routes';

export interface NoteDetailScreenProps {
  noteId?: string;
}

/**
 * A department note at `/notes/[id]`, read from the persisted notes list so it opens offline. The body is server HTML
 * and renders only through the sanitizing HtmlRenderer; it grows to fit its text and the page scrolls the rest.
 */
export default function NoteDetailScreen({ noteId: noteIdProp }: NoteDetailScreenProps) {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = noteIdProp ?? (Array.isArray(params.id) ? params.id[0] : params.id);
  const noteId = isSafeRouteId(rawId) ? rawId : null;
  const note = useNotesStore((state) => (noteId ? state.notes.find((item) => item.NoteId === noteId) : undefined));
  const isLoading = useNotesStore((state) => state.loading.notes === true);
  const hasNote = note !== undefined;

  // Opened from a link, or before the list loaded on this device: there is no single-note read, so load the list.
  useEffect(() => {
    if (noteId && !hasNote) void useNotesStore.getState().fetchNotes();
  }, [noteId, hasNote]);

  const back = () => (router.canGoBack() ? router.back() : router.replace(noteRoutes.noteList()));

  if (!note) {
    return (
      <View className="flex-1 bg-background-50" testID="note-detail-screen">
        <ScreenHeader title={t('notes.details.title')} onBack={back} />
        {isLoading && noteId ? (
          <Loading />
        ) : (
          <ZeroState icon={StickyNote} heading={t('notes.not_found')} onRetry={noteId ? () => useNotesStore.getState().fetchNotes({ bypassCache: true }) : undefined} testID="note-detail-missing" />
        )}
      </View>
    );
  }

  const added = formatUtcInDepartmentTime(note.AddedOn, timeZone);
  const expires = note.ExpiresOn ? formatUtcInDepartmentTime(note.ExpiresOn, timeZone) : '';

  return (
    <View className="flex-1 bg-background-50" testID="note-detail-screen">
      <ScreenHeader title={note.Title} onBack={back} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View className="rounded-xl border border-outline-200 bg-background-0 p-4">
          <Text className="text-lg font-bold text-typography-900" accessibilityRole="header">
            {note.Title}
          </Text>
          {note.Category ? (
            <Text size="sm" className="text-typography-500">
              {`${t('notes.details.tags')}: ${note.Category}`}
            </Text>
          ) : null}
          {note.Body ? <HtmlRenderer html={note.Body} rendererKey={note.NoteId} autoHeight style={styles.html} testID="note-detail-html" /> : null}
          {added ? (
            <Text size="xs" className="mt-3 text-typography-500">
              {`${t('notes.details.created')}: ${added}`}
            </Text>
          ) : null}
          {expires ? (
            <Text size="xs" className="text-typography-500">
              {`${t('notes.details.expires')}: ${expires}`}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },
  html: { marginTop: 8 },
});
