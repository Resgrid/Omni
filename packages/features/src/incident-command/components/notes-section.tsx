import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useTranslation } from '@resgrid/i18n';
import { IncidentContentVisibility, type IncidentNote } from '@resgrid/models';
import { Badge, BadgeText, HStack, Text, VStack } from '@resgrid/ui';
import { Plus, StickyNote } from 'lucide-react-native';
import React, { useMemo } from 'react';

import { isLocalId } from '../lib/board';
import { BoardButton } from './board-buttons';
import { SectionCard, SectionEmpty } from './section-card';
import { sortByCreated } from './sort';

export interface NotesSectionProps {
  notes: IncidentNote[];
  canAdd: boolean;
  onAdd: () => void;
  authorName?: (userId: string) => string;
  testID?: string;
}

/** Operational status notes (IC notes section), newest first; public notes are marked. */
export const NotesSection: React.FC<NotesSectionProps> = ({ notes, canAdd, onAdd, authorName, testID = 'command-notes' }) => {
  const { t } = useTranslation();
  const sorted = useMemo(() => sortByCreated(notes.filter((note) => !note.DeletedOn)), [notes]);
  return (
    <SectionCard
      title={t('incident_command.notes')}
      icon={StickyNote}
      count={sorted.length}
      action={canAdd ? <BoardButton label={t('incident_command.add_note')} icon={Plus} onPress={onAdd} testID={`${testID}-add`} /> : undefined}
      testID={testID}
    >
      {sorted.length === 0 ? (
        <SectionEmpty text={t('incident_command.no_notes')} />
      ) : (
        <VStack space="sm">
          {sorted.map((note) => (
            <VStack key={note.IncidentNoteId} className="rounded-lg bg-background-50 p-2" testID={`${testID}-item-${note.IncidentNoteId}`}>
              <HStack className="items-center justify-between" space="sm">
                <Text className="min-w-0 flex-1 font-medium text-typography-900">{note.Title || ''}</Text>
                {note.Visibility === IncidentContentVisibility.Public ? (
                  <Badge action="info" size="sm">
                    <BadgeText>{t('incident_command.note_public')}</BadgeText>
                  </Badge>
                ) : null}
              </HStack>
              <Text className="text-sm text-typography-900">{note.Body}</Text>
              <Text className="text-xs text-typography-500">
                {[isLocalId(note.IncidentNoteId) ? t('incident_command.pending_sync') : formatUtcInDepartmentTime(note.CreatedOn, null), note.CreatedByUserId && authorName ? authorName(note.CreatedByUserId) : '']
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </VStack>
          ))}
        </VStack>
      )}
    </SectionCard>
  );
};
