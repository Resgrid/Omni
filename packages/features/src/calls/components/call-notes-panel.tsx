import { isFieldRedacted, ProtectedFieldIds, useSecurity } from '@resgrid/auth';
import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { type CallNoteListItem, getDataLocationFix, searchCallNotes, useCallDetailStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallNoteResultData } from '@resgrid/models';
import { Button, ButtonText, Input, InputField, Text, Textarea, TextareaInput, useToast } from '@resgrid/ui';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export interface CallNotesPanelProps {
  callId: string;
  /** Hide the search box (inline tab with few notes). */
  showSearch?: boolean;
}

const EMPTY_NOTES: CallNoteResultData[] = [];

/**
 * A call's notes with search and the add-note composer (R notes modal UI). Adding is offline-capable: the note goes
 * through the outbox, shows at once with a "Queued" marker and replays on reconnect; a refused note is marked.
 */
export const CallNotesPanel: React.FC<CallNotesPanelProps> = ({ callId, showSearch = true }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { canUserCreateNotes } = useSecurity();
  const serverNotes = useCallDetailStore((state) => state.details[callId]?.notes ?? EMPTY_NOTES);
  const queuedNotes = useCallDetailStore((state) => state.queuedNotes);
  const isLoading = useCallDetailStore((state) => state.loading.notes === true);
  const fetchCallNotes = useCallDetailStore((state) => state.fetchCallNotes);
  const addNote = useCallDetailStore((state) => state.addNote);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void fetchCallNotes(callId);
  }, [callId, fetchCallNotes]);

  const notes = useMemo<CallNoteListItem[]>(() => {
    const queued: CallNoteListItem[] = Object.values(queuedNotes)
      .filter((note) => note.callId === callId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((note) => ({
        CallId: note.callId,
        CallNoteId: note.localId,
        UserId: '',
        Source: 0,
        TimestampFormatted: '',
        Timestamp: new Date(note.createdAt).toISOString(),
        TimestampUtc: new Date(note.createdAt).toISOString(),
        Note: note.note,
        Latitude: note.latitude,
        Longitude: note.longitude,
        FullName: '',
        queued: { localId: note.localId, state: note.state },
      }));
    return [...(searchCallNotes(serverNotes, query) as CallNoteListItem[]), ...queued.filter((note) => !query.trim() || note.Note.toLowerCase().includes(query.trim().toLowerCase()))];
  }, [callId, query, queuedNotes, serverNotes]);

  const submit = async () => {
    const note = draft.trim();
    if (!note) return;
    setIsSaving(true);
    try {
      const fix = getDataLocationFix();
      const result = await addNote({ callId, note, latitude: fix?.latitude ?? null, longitude: fix?.longitude ?? null });
      setDraft('');
      if (result.outcome === 'queued') toast.info(t('callNotes.queued'));
      else if (result.outcome === 'rejected') toast.error(t('callNotes.rejected'));
    } catch {
      toast.error(t('callNotes.save_error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.panel} testID="call-notes-panel">
      {showSearch ? (
        <Input variant="outline" size="sm" className="mb-2">
          <InputField value={query} onChangeText={setQuery} placeholder={t('callNotes.searchPlaceholder')} accessibilityLabel={t('callNotes.searchPlaceholder')} testID="call-notes-search" />
        </Input>
      ) : null}
      {notes.length === 0 ? (
        <Text className="py-4 text-center text-typography-500">{isLoading ? t('common.loading') : query ? t('callNotes.noSearchResults') : t('callNotes.noNotes')}</Text>
      ) : (
        notes.map((note) => {
          const isProtected = isFieldRedacted(null, ProtectedFieldIds.callNote, note.Note);
          return (
            <View key={note.CallNoteId} style={styles.note} className="border-outline-100" testID={`call-note-${note.CallNoteId}`}>
              <Text className="text-typography-900">{isProtected ? t('data_protection.protected_value') : note.Note}</Text>
              <View style={styles.meta}>
                <Text size="xs" className="text-typography-500">
                  {[note.FullName, formatUtcInDepartmentTime(note.TimestampUtc || note.Timestamp, null)].filter(Boolean).join(' · ')}
                </Text>
                {note.queued ? (
                  <Text size="xs" className={note.queued.state === 'rejected' ? 'font-semibold text-error-600' : 'font-semibold text-warning-700'} testID={`call-note-${note.CallNoteId}-queued`}>
                    {note.queued.state === 'rejected' ? t('callNotes.rejected_marker') : t('callNotes.queued_marker')}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })
      )}
      {canUserCreateNotes ? (
        <View style={styles.composer}>
          <Text size="sm" className="mb-1 text-typography-600">
            {t('callNotes.addNoteLabel')}
          </Text>
          <Textarea size="md">
            <TextareaInput value={draft} onChangeText={setDraft} placeholder={t('callNotes.addNotePlaceholder')} accessibilityLabel={t('callNotes.addNoteLabel')} testID="call-notes-input" />
          </Textarea>
          <Button className="mt-2" onPress={() => void submit()} isDisabled={isSaving || !draft.trim()} accessibilityLabel={t('callNotes.addNote')} testID="call-notes-add">
            <ButtonText>{t('callNotes.addNote')}</ButtonText>
          </Button>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
  note: { borderBottomWidth: 1, paddingVertical: 8 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  composer: { marginTop: 12 },
});
