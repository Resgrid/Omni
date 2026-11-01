import { useSecurity, useTerm } from '@resgrid/auth';
import { searchNotes, useNotesStore } from '@resgrid/data';
import { CallNotesPanel } from '@resgrid/features/calls';
import { NoteCard, NoteDetailsSheet } from '@resgrid/features/notes';
import { useTranslation } from '@resgrid/i18n';
import type { NoteResultData } from '@resgrid/models';
import { FlatList, Text } from '@resgrid/ui';
import { FileText, Plus, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PanelFrame, PanelIconButton } from './panel-frame';
import { PanelSearch } from './panel-search';

export interface NotesPanelProps {
  /** Filtered to a call: shows that call's notes with the (offline-capable) composer instead of department notes. */
  callId: string | null;
  onNewNote?: () => void;
  flex?: number;
  maxHeight?: number;
}

/**
 * The console's notes (Dispatch baseline): department notes (searchable, opening the sanitized note sheet) and, while
 * filtered to a call, the call's notes and composer (shared calls notes panel: queued offline, replayed once).
 */
export const NotesPanel: React.FC<NotesPanelProps> = ({ callId, onNewNote, flex, maxHeight }) => {
  const { t } = useTranslation();
  const { canUserCreateNotes } = useSecurity();
  const title = useTerm('module.notes', t('dispatch.notes'));
  const notes = useNotesStore((state) => state.notes);
  const isLoading = useNotesStore((state) => state.loading.notes === true);
  const [query, setQuery] = useState('');
  const [openNote, setOpenNote] = useState<NoteResultData | null>(null);
  const visible = useMemo(() => searchNotes(notes, query), [notes, query]);

  const renderItem = useCallback(({ item }: { item: NoteResultData }) => <NoteCard note={item} onPress={setOpenNote} />, []);

  return (
    <PanelFrame
      title={callId ? t('dispatch.call_notes') : title}
      icon={FileText}
      iconColor="#f59e0b"
      cardKey="notes"
      count={callId ? undefined : visible.length}
      flex={flex}
      maxHeight={maxHeight}
      testID="notes-panel"
      right={
        callId ? null : (
          <>
            <PanelIconButton icon={RefreshCw} onPress={() => void useNotesStore.getState().fetchNotes({ bypassCache: true })} accessibilityLabel={t('common.refresh')} testID="notes-refresh" />
            {canUserCreateNotes && onNewNote ? <PanelIconButton icon={Plus} color="#6366f1" onPress={onNewNote} accessibilityLabel={t('dispatch.add_note_title')} testID="notes-new" /> : null}
          </>
        )
      }
    >
      {callId ? (
        <CallNotesPanel callId={callId} showSearch={false} />
      ) : (
        <>
          <PanelSearch value={query} onChange={setQuery} placeholder={t('dispatch_console.search_notes')} testID="notes-search" />
          <FlatList
            testID="notes-list"
            data={visible}
            renderItem={renderItem}
            keyExtractor={(item: NoteResultData) => item.NoteId}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text className="text-center text-sm text-typography-500">{isLoading ? t('common.loading') : t('dispatch.no_notes')}</Text>
              </View>
            }
          />
          <NoteDetailsSheet note={openNote} isOpen={openNote !== null} onClose={() => setOpenNote(null)} />
        </>
      )}
    </PanelFrame>
  );
};

const styles = StyleSheet.create({
  list: { padding: 8 },
  empty: { padding: 24, alignItems: 'center' },
});
