import { useAuthStore } from '@resgrid/auth';
import { usePersonnelStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { type ChatChannelResultData } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, HStack, Input, InputField, Pressable, ScrollView, Spinner, Text, View, VStack } from '@resgrid/ui';
import { Check } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';

import { startDirectConversation, startGroupConversation } from '../lib/chat-actions';

export interface NewConversationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (channel: ChatChannelResultData) => void;
}

const fullName = (person: { FirstName?: string; LastName?: string }): string => `${person.FirstName ?? ''} ${person.LastName ?? ''}`.trim();

/** Start a conversation (Dispatch sheet): one person opens a direct message, several create a named group. Online only. */
export const NewConversationSheet: React.FC<NewConversationSheetProps> = ({ isOpen, onClose, onCreated }) => {
  const { t } = useTranslation();
  const userId = useAuthStore((state) => state.userId);
  const personnel = usePersonnelStore((state) => state.personnel);
  const isLoading = usePersonnelStore((state) => state.loading.personnel === true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelected([]);
    setGroupName('');
    setError(null);
    if (usePersonnelStore.getState().personnel.length === 0) void usePersonnelStore.getState().fetchPersonnel();
  }, [isOpen]);

  const people = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return personnel.filter((person) => person.UserId !== userId && (!needle || fullName(person).toLowerCase().includes(needle) || (person.GroupName ?? '').toLowerCase().includes(needle)));
  }, [personnel, query, userId]);

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const create = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const channel = selected.length === 1 ? await startDirectConversation(selected[0]) : await startGroupConversation(groupName.trim(), selected);
      if (!channel) throw new Error('No channel returned');
      onCreated(channel);
      onClose();
    } catch {
      setError(t('chat.create_conversation_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[85]} testID="new-conversation-sheet">
      <VStack space="md" className="w-full flex-1">
        <Text className="text-lg font-bold text-typography-900">{selected.length > 1 ? t('chat.new_group') : t('chat.new_direct_message')}</Text>
        <Input>
          <InputField testID="new-conversation-search" value={query} onChangeText={setQuery} placeholder={t('chat.search_people')} accessibilityLabel={t('chat.search_people')} />
        </Input>
        {selected.length > 1 ? (
          <Input>
            <InputField testID="new-conversation-group-name" value={groupName} onChangeText={setGroupName} placeholder={t('chat.group_name')} accessibilityLabel={t('chat.group_name')} />
          </Input>
        ) : null}
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          {isLoading && personnel.length === 0 ? <Spinner /> : null}
          {!isLoading && people.length === 0 ? <Text className="py-4 text-center text-typography-500">{t('chat.no_people')}</Text> : null}
          {people.map((person) => {
            const isSelected = selected.includes(person.UserId);
            return (
              <Pressable
                key={person.UserId}
                testID={`new-conversation-person-${person.UserId}`}
                onPress={() => toggle(person.UserId)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                className={`rounded-lg px-3 py-2.5 ${isSelected ? 'bg-primary-50' : ''}`}
              >
                <HStack space="sm" className="items-center">
                  <View className={`size-5 items-center justify-center rounded border-2 ${isSelected ? 'border-primary-500 bg-primary-500' : 'border-outline-300'}`}>
                    {isSelected ? <Check size={12} color="#ffffff" /> : null}
                  </View>
                  <VStack className="flex-1">
                    <Text className="text-typography-900">{fullName(person)}</Text>
                    {person.GroupName ? <Text className="text-xs text-typography-500">{person.GroupName}</Text> : null}
                  </VStack>
                </HStack>
              </Pressable>
            );
          })}
        </ScrollView>
        {error ? (
          <Text className="text-center text-sm text-error-600" testID="new-conversation-error" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button onPress={() => void create()} isDisabled={selected.length === 0 || busy} testID="new-conversation-create">
          {busy ? <Spinner size="small" /> : <ButtonText>{selected.length > 1 ? t('chat.create_group_with', { count: selected.length }) : t('chat.start_conversation')}</ButtonText>}
        </Button>
      </VStack>
    </CustomBottomSheet>
  );
};
