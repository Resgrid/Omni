import { parseUtcMs } from '@resgrid/core/utils/dates';
import { useContactsStore } from '@resgrid/data';
import { ProtectedLabel } from '@resgrid/features/data-protection';
import { useTranslation } from '@resgrid/i18n';
import { type ContactNoteResultData } from '@resgrid/models';
import { HStack, Spinner, Text, VStack, ZeroState } from '@resgrid/ui';
import { AlertTriangle, StickyNote } from 'lucide-react-native';
import React, { useEffect } from 'react';

import { htmlToText } from '../lib/contact-format';

const NO_NOTES: ContactNoteResultData[] = [];

/** Whether a note has passed its expiry (shown dimmed with a label, as Dispatch does). */
export const isContactNoteExpired = (note: Pick<ContactNoteResultData, 'ExpiresOnUtc'>, now = Date.now()): boolean => {
  const expires = parseUtcMs(note.ExpiresOnUtc);
  return expires !== null && expires < now;
};

/** A contact's notes (U/I + D): alert notes flagged, expired notes marked, rich text shown as plain text. */
export const ContactNotesList: React.FC<{ contactId: string }> = ({ contactId }) => {
  const { t } = useTranslation();
  const notes = useContactsStore((state) => state.notesByContact[contactId] ?? NO_NOTES);
  const isLoading = useContactsStore((state) => state.loading.notes === true);

  useEffect(() => {
    void useContactsStore.getState().fetchContactNotes(contactId);
  }, [contactId]);

  if (isLoading && notes.length === 0) return <Spinner testID="contact-notes-loading" />;
  if (notes.length === 0) return <ZeroState icon={StickyNote} heading={t('contacts.contactNotesEmpty')} description={t('contacts.contactNotesEmptyDescription')} viewClassName="p-4" testID="contact-notes-empty" />;

  return (
    <VStack space="sm" testID="contact-notes-list">
      {notes
        .filter((note) => !note.IsDeleted)
        .map((note) => {
          const expired = isContactNoteExpired(note);
          return (
            <VStack
              key={note.ContactNoteId}
              space="xs"
              className={`rounded-lg border p-3 ${note.ShouldAlert ? 'border-warning-300 bg-warning-50' : 'border-outline-200 bg-background-0'} ${expired ? 'opacity-60' : ''}`}
              testID={`contact-note-${note.ContactNoteId}`}
            >
              <HStack space="sm" className="items-center">
                {note.ShouldAlert ? <AlertTriangle size={14} color="#d97706" /> : null}
                {note.NoteType ? <Text className="text-xs font-semibold uppercase text-typography-500">{note.NoteType}</Text> : null}
                {expired ? <Text className="text-xs text-error-600">{t('contacts.contactNotesExpired')}</Text> : null}
              </HStack>
              {note.Note === 'REDACTED' ? <ProtectedLabel size="sm" /> : <Text className="text-sm text-typography-900">{htmlToText(note.Note)}</Text>}
              <Text className="text-xs text-typography-400">{[note.AddedByName, note.AddedOn].filter((part) => !!part).join(' • ')}</Text>
            </VStack>
          );
        })}
    </VStack>
  );
};
