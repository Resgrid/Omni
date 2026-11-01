import { type AssistantMessage, useIncidentAssistantStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Badge, BadgeText, HStack, Input, InputField, Pressable, ScrollView, Spinner, Text, VStack } from '@resgrid/ui';
import { Send, Sparkles, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { IconPress } from '../board-buttons';
import { SheetForm } from './sheet-form';

const EMPTY: AssistantMessage[] = [];

export interface AssistantSheetProps {
  isOpen: boolean;
  onClose: () => void;
  callId: string;
  /** Offline: the assistant needs the server (Omni dropped IC's on-device matcher); the input is disabled. */
  isOnline: boolean;
}

/**
 * The incident assistant (IC assistant sheet) on Core's incident Q&A: one-tap suggestions for the incident's ICS type
 * and a per-incident conversation. Shown only behind the department's `Ai.Assistant` flag; online only.
 */
export const AssistantSheet: React.FC<AssistantSheetProps> = ({ isOpen, onClose, callId, isOnline }) => {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const messages = useIncidentAssistantStore((state) => state.messagesByCallId[callId] ?? EMPTY);
  const suggestions = useIncidentAssistantStore((state) => state.suggestionsByCallId[callId] ?? null);
  const isAsking = useIncidentAssistantStore((state) => state.askingCallId === callId);
  const askError = useIncidentAssistantStore((state) => state.askError);

  useEffect(() => {
    if (isOpen && isOnline) void useIncidentAssistantStore.getState().fetchSuggestions(callId);
  }, [callId, isOnline, isOpen]);

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isAsking || !isOnline) return;
      setQuestion('');
      void useIncidentAssistantStore.getState().ask(callId, trimmed);
    },
    [callId, isAsking, isOnline]
  );

  return (
    <SheetForm isOpen={isOpen} onClose={onClose} title={t('incident_command.assistant_title')} description={suggestions?.IncidentType || undefined} snapPoint={85} testID="assistant-sheet">
      <HStack className="mb-2 items-center justify-end" space="xs">
        {isOnline ? null : (
          <Badge action="warning" size="sm" testID="assistant-sheet-offline">
            <BadgeText>{t('incident_command.assistant_offline')}</BadgeText>
          </Badge>
        )}
        {messages.length > 0 ? <IconPress label={t('incident_command.assistant_clear')} icon={Trash2} onPress={() => useIncidentAssistantStore.getState().clear(callId)} testID="assistant-sheet-clear" /> : null}
      </HStack>
      {suggestions && suggestions.Questions.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2" testID="assistant-sheet-suggestions">
          <HStack space="sm">
            {suggestions.Questions.map((suggestion) => (
              <Pressable key={suggestion} onPress={() => submit(suggestion)} disabled={!isOnline} accessibilityRole="button" accessibilityLabel={suggestion} className="rounded-full bg-background-100 px-4 py-2">
                <Text className="text-xs font-medium text-typography-800">{suggestion}</Text>
              </Pressable>
            ))}
          </HStack>
        </ScrollView>
      ) : null}
      {messages.length === 0 ? (
        <VStack className="items-center py-6" space="xs" testID="assistant-sheet-empty">
          <View>
            <Sparkles size={32} color="#9ca3af" />
          </View>
          <Text className="text-center text-sm text-typography-500">{t('incident_command.assistant_empty')}</Text>
        </VStack>
      ) : (
        <VStack space="sm" testID="assistant-sheet-messages">
          {messages.map((message) =>
            message.role === 'user' ? (
              <View key={message.id} className="self-end rounded-2xl bg-primary-600 px-3 py-2">
                <Text className="text-sm text-white">{message.text}</Text>
              </View>
            ) : (
              <View key={message.id} className={`self-start rounded-2xl px-3 py-2 ${message.unanswered ? 'bg-error-50' : 'bg-background-100'}`} testID={`assistant-sheet-answer-${message.id}`}>
                <Text className="text-sm text-typography-900">{message.unanswered || !message.text ? t('incident_command.assistant_unanswered') : message.text}</Text>
              </View>
            )
          )}
        </VStack>
      )}
      {isAsking ? (
        <HStack className="mt-2 items-center" space="sm" testID="assistant-sheet-thinking">
          <Spinner size="small" />
          <Text className="text-xs text-typography-500">{t('incident_command.assistant_thinking')}</Text>
        </HStack>
      ) : null}
      {askError ? <Text className="mt-2 text-xs text-error-600">{t('incident_command.assistant_error')}</Text> : null}
      <HStack className="mt-3 items-center" space="sm">
        <Input className="flex-1" size="md" variant="outline" isDisabled={!isOnline}>
          <InputField
            value={question}
            onChangeText={setQuestion}
            onSubmitEditing={() => submit(question)}
            returnKeyType="send"
            placeholder={t('incident_command.assistant_placeholder')}
            accessibilityLabel={t('incident_command.assistant_placeholder')}
            testID="assistant-sheet-input"
          />
        </Input>
        <IconPress label={t('incident_command.assistant_send')} icon={Send} color="#2563eb" onPress={() => submit(question)} testID="assistant-sheet-send" />
      </HStack>
    </SheetForm>
  );
};
