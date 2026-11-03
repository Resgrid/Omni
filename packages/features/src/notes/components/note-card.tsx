import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import type { NoteResultData } from '@resgrid/models';
import { HStack, htmlToPlainText, Pressable, Text, useReadableColor } from '@resgrid/ui';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

export interface NoteCardProps {
  note: NoteResultData;
  onPress: (note: NoteResultData) => void;
}

/**
 * A department note row (Dispatch's note card): title with its category badge, a plain-text preview of the body (no
 * HTML in list rows) and the date. A note colour, when the department set one, edges the card.
 */
export const NoteCard: React.FC<NoteCardProps> = ({ note, onPress }) => {
  const { t } = useTranslation();
  const readable = useReadableColor();
  const preview = useMemo(() => (note.Body ? htmlToPlainText(note.Body) : ''), [note.Body]);
  const added = formatUtcInDepartmentTime(note.AddedOn, null, { dateStyle: 'medium' });

  return (
    <Pressable
      onPress={() => onPress(note)}
      accessibilityRole="button"
      accessibilityLabel={note.Category ? `${note.Title}, ${note.Category}` : note.Title}
      accessibilityHint={t('notes.open_hint')}
      testID={`note-card-${note.NoteId}`}
      className="mb-2 rounded-lg border border-outline-200 bg-background-50 p-2"
      style={note.Color ? StyleSheet.flatten([styles.edged, { borderLeftColor: readable.mark(note.Color) }]) : undefined}
    >
      <HStack space="sm" className="items-start justify-between">
        <Text className="flex-1 text-sm font-semibold text-typography-800" numberOfLines={1}>
          {note.Title}
        </Text>
        {note.Category ? (
          <View className="rounded bg-info-50 px-1.5 py-0.5">
            <Text className="text-xs text-info-700" numberOfLines={1}>
              {note.Category}
            </Text>
          </View>
        ) : null}
      </HStack>
      {preview ? (
        <Text className="mt-1 text-xs text-typography-600" numberOfLines={2}>
          {preview}
        </Text>
      ) : null}
      {added ? <Text className="mt-1 text-xs text-typography-400">{added}</Text> : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  edged: { borderLeftWidth: 3 },
});
