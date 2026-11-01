import { useTerm } from '@resgrid/auth';
import { searchNotes, useNotesStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { NoteResultData } from '@resgrid/models';
import { FlatList, Input, InputField, Loading, Pressable, RefreshControl, Text, ZeroState } from '@resgrid/ui';
import { StickyNote } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { NoteCard } from '../components/note-card';
import { NoteDetailsSheet } from '../components/note-details-sheet';

/** Department notes (Unit/IC list with HtmlRenderer + Responder search); persisted, so it works offline. */
export default function NoteListScreen() {
  const { t } = useTranslation();
  const title = useTerm('module.notes', t('notes.title'));
  const notes = useNotesStore((state) => state.notes);
  const isLoading = useNotesStore((state) => state.loading.notes === true);
  const fetchNotes = useNotesStore((state) => state.fetchNotes);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<NoteResultData | null>(null);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  const categories = useMemo(() => [...new Set(notes.map((note) => note.Category).filter((value): value is string => !!value))].sort(), [notes]);
  const visible = useMemo(() => searchNotes(category ? notes.filter((note) => note.Category === category) : notes, query), [notes, category, query]);

  return (
    <View style={styles.screen} className="bg-background-50" testID="note-list-screen">
      <View style={styles.search}>
        <Input variant="outline" size="md">
          <InputField value={query} onChangeText={setQuery} placeholder={t('notes.search')} accessibilityLabel={`${title}: ${t('notes.search')}`} testID="note-search" />
        </Input>
        {categories.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categories} testID="note-categories">
            {[null, ...categories].map((value) => {
              const isSelected = value === category;
              const label = value ?? t('notes.all_categories');
              return (
                <Pressable
                  key={value ?? '__all'}
                  onPress={() => setCategory(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={label}
                  className={`mr-2 rounded-full px-3 py-1 ${isSelected ? 'bg-primary-600' : 'bg-background-200'}`}
                >
                  <Text size="sm" className={isSelected ? 'text-typography-0' : 'text-typography-700'}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>
      <FlatList
        data={visible}
        keyExtractor={(item: NoteResultData) => item.NoteId}
        renderItem={({ item }: { item: NoteResultData }) => <NoteCard note={item} onPress={setSelected} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void fetchNotes({ bypassCache: true })} />}
        ListEmptyComponent={isLoading ? <Loading /> : <ZeroState icon={StickyNote} heading={t('notes.empty')} description={t('notes.emptyDescription')} testID="note-list-empty" />}
        testID="note-list"
      />
      <NoteDetailsSheet note={selected} isOpen={selected !== null} onClose={() => setSelected(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: { paddingHorizontal: 12, paddingTop: 12 },
  categories: { marginTop: 8 },
  list: { padding: 12 },
});
