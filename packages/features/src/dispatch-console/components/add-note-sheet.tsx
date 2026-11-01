import { useNotesStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, HStack, Input, InputField, NativeModal, Pressable, ScrollView, Text, Textarea, TextareaInput, useToast, VStack } from '@resgrid/ui';
import { X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

export interface AddNoteSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onNoteAdded?: () => void;
}

/**
 * A new department note from the console (Dispatch baseline add-note sheet): title, body and an optional category.
 * Department notes are an online write (admins edit them; not in Dispatch's offline scope), so a failure keeps the
 * sheet open with the text.
 */
export const AddNoteSheet: React.FC<AddNoteSheetProps> = ({ isOpen, onClose, onNoteAdded }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const categories = useNotesStore((state) => state.categories);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle('');
    setBody('');
    setCategory('');
    setShowErrors(false);
    if (useNotesStore.getState().categories.length === 0) void useNotesStore.getState().fetchCategories();
  }, [isOpen]);

  const save = async () => {
    if (!title.trim() || !body.trim()) {
      setShowErrors(true);
      return;
    }
    setIsSaving(true);
    const saved = await useNotesStore.getState().saveNote({ Title: title.trim(), Body: body.trim(), Category: category || null, IsAdminOnly: false });
    setIsSaving(false);
    if (saved) {
      toast.success(t('dispatch_console.note_saved'));
      onNoteAdded?.();
      onClose();
    } else {
      toast.error(t('dispatch_console.note_save_failed'));
    }
  };

  return (
    <NativeModal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} testID="add-note-sheet">
      <View style={styles.screen} className="bg-background-0">
        <HStack className="items-center justify-between border-b border-outline-100 px-4 py-3">
          <Text className="text-lg font-bold">{t('dispatch.add_note_title')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')} testID="add-note-sheet-close">
            <View>
              <X size={22} color="#6b7280" />
            </View>
          </Pressable>
        </HStack>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <VStack space="md">
            <VStack space="xs">
              <Text className="text-sm font-medium">{t('dispatch_console.note_title')}</Text>
              <Input isInvalid={showErrors ? !title.trim() : false}>
                <InputField value={title} onChangeText={setTitle} accessibilityLabel={t('dispatch_console.note_title')} testID="add-note-title" />
              </Input>
            </VStack>
            <VStack space="xs">
              <Text className="text-sm font-medium">{t('dispatch_console.note_body')}</Text>
              <Textarea isInvalid={showErrors ? !body.trim() : false}>
                <TextareaInput value={body} onChangeText={setBody} accessibilityLabel={t('dispatch_console.note_body')} testID="add-note-body" />
              </Textarea>
            </VStack>
            {categories.length > 0 ? (
              <VStack space="xs">
                <Text className="text-sm font-medium">{t('dispatch_console.note_category')}</Text>
                <HStack className="flex-wrap">
                  {categories.map((entry) => (
                    <Pressable
                      key={entry.NoteCategoryId || entry.Category}
                      onPress={() => setCategory((current) => (current === entry.Category ? '' : entry.Category))}
                      accessibilityRole="button"
                      accessibilityState={{ selected: category === entry.Category }}
                      className={`mb-2 mr-2 rounded-full border px-3 py-1 ${category === entry.Category ? 'border-primary-500 bg-primary-500' : 'border-outline-300'}`}
                      testID={`add-note-category-${entry.Category}`}
                    >
                      <Text className={`text-xs ${category === entry.Category ? 'text-typography-0' : 'text-typography-700'}`}>{entry.Category}</Text>
                    </Pressable>
                  ))}
                </HStack>
              </VStack>
            ) : null}
            {showErrors && (!title.trim() || !body.trim()) ? <Text className="text-sm text-error-600">{t('dispatch_console.note_required')}</Text> : null}
            <Button onPress={() => void save()} isDisabled={isSaving} testID="add-note-save">
              {isSaving ? <ButtonSpinner /> : null}
              <ButtonText>{t('common.save')}</ButtonText>
            </Button>
          </VStack>
        </ScrollView>
      </View>
    </NativeModal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16 },
});
