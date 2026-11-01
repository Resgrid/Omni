import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import type { NoteResultData } from '@resgrid/models';
import { htmlToPlainText, Pressable, Text } from '@resgrid/ui';
import { StickyNote } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

export interface NoteCardProps {
  note: NoteResultData;
  onPress: (note: NoteResultData) => void;
}

/** A department note row: title, category, a plain-text preview of the body (no HTML in list rows) and the date. */
export const NoteCard: React.FC<NoteCardProps> = ({ note, onPress }) => {
  const { t } = useTranslation();
  const preview = useMemo(() => (note.Body ? htmlToPlainText(note.Body) : ''), [note.Body]);
  const added = formatUtcInDepartmentTime(note.AddedOn, null, { dateStyle: 'medium' });
  return (
    <Pressable
      onPress={() => onPress(note)}
      accessibilityRole="button"
      accessibilityLabel={note.Category ? `${note.Title}, ${note.Category}` : note.Title}
      accessibilityHint={t('notes.open_hint')}
      testID={`note-card-${note.NoteId}`}
      className="mb-2 rounded-xl border border-outline-100 bg-background-0 p-3"
    >
      <View style={styles.row}>
        <View style={StyleSheet.flatten([styles.swatch, note.Color ? { backgroundColor: note.Color } : styles.swatchDefault])}>
          <StickyNote size={16} color="#FFFFFF" />
        </View>
        <View style={styles.body}>
          <Text className="font-semibold text-typography-900">{note.Title}</Text>
          {note.Category ? (
            <Text size="xs" className="text-typography-500">
              {note.Category}
            </Text>
          ) : null}
          {preview ? (
            <Text size="sm" className="mt-1 text-typography-600" numberOfLines={2}>
              {preview}
            </Text>
          ) : null}
          {added ? (
            <Text size="xs" className="mt-1 text-typography-400">
              {added}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  swatch: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  swatchDefault: { backgroundColor: '#6B7280' },
  body: { flex: 1 },
});
