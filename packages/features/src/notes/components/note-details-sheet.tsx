import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import type { NoteResultData } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, HtmlRenderer, Text } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface NoteDetailsSheetProps {
  note: NoteResultData | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * A department note in a sheet; the body is server HTML and renders only through the sanitizing HtmlRenderer. The body
 * grows to fit its text (up to most of the screen, then scrolls inside its box) and the sheet scrolls the rest.
 */
export const NoteDetailsSheet: React.FC<NoteDetailsSheetProps> = ({ note, isOpen, onClose }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const isVisible = isOpen ? note !== null : false;
  const added = note ? formatUtcInDepartmentTime(note.AddedOn, timeZone) : '';
  const expires = note?.ExpiresOn ? formatUtcInDepartmentTime(note.ExpiresOn, timeZone) : '';

  return (
    <CustomBottomSheet isOpen={isVisible} onClose={onClose} snapPoints={[80]} testID="note-details-sheet">
      {note ? (
        <View style={styles.content}>
          <Text className="text-lg font-bold text-typography-900" accessibilityRole="header">
            {note.Title}
          </Text>
          {note.Category ? (
            <Text size="sm" className="text-typography-500">
              {`${t('notes.details.tags')}: ${note.Category}`}
            </Text>
          ) : null}
          {note.Body ? <HtmlRenderer html={note.Body} rendererKey={note.NoteId} autoHeight style={styles.html} testID="note-details-html" /> : null}
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
          <View style={styles.footer}>
            <Button variant="outline" onPress={onClose} accessibilityLabel={t('notes.details.close')} testID="note-details-close">
              <ButtonText>{t('notes.details.close')}</ButtonText>
            </Button>
          </View>
        </View>
      ) : null}
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  content: { width: '100%' },
  html: { marginTop: 8 },
  footer: { marginTop: 16, marginBottom: 8 },
});
