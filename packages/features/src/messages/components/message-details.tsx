import { useMessagesStore } from '@resgrid/data';
import { ProtectedLabel } from '@resgrid/features/data-protection';
import { useTranslation } from '@resgrid/i18n';
import type { MessageResultData } from '@resgrid/models';
import { Badge, BadgeText, Box, Button, ButtonSpinner, ButtonText, HStack, Pressable, Spinner, Text, Textarea, TextareaInput, useThemeColors, useToast, VStack } from '@resgrid/ui';
import { Check, Clock, Reply, Trash2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { canRespondToMessage, formatSentOn, formatUtc, getMessageTypeAction, getMessageTypeKey, getResponseKey, isCalendarRsvp, isMessageExpired, isWithheld, MessageResponseType } from '../lib/message-format';

type Panel = 'details' | 'respond' | 'delete';

const RESPONSE_CHOICES = [
  { type: MessageResponseType.Yes, key: 'messages.response_yes' },
  { type: MessageResponseType.Maybe, key: 'messages.response_maybe' },
  { type: MessageResponseType.No, key: 'messages.response_no' },
] as const;

export interface MessageDetailsProps {
  messageId: string;
  /** The list copy, shown at once while the detail (recipients, responses) loads. */
  fallback?: MessageResultData | null;
  /** The caller sent it (outbox): no answering. */
  isOwn?: boolean;
  /** Called after the message was deleted (close the sheet / leave the screen). */
  onDeleted?: () => void;
}

/**
 * One message: subject, sender, body, recipients with their answers, and the caller's actions — answer a callback or
 * poll (Yes / Maybe / No with a note), RSVP to a calendar invitation, or delete. Opening it marks it read (on the
 * server too: `GetMessage` writes the read receipt). Answers and deletes are online only.
 */
export const MessageDetails: React.FC<MessageDetailsProps> = ({ messageId, fallback = null, isOwn = false, onDeleted }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const colors = useThemeColors();
  const toast = useToast();
  const loaded = useMessagesStore((state) => state.messageDetailsById[messageId]);
  const isLoading = useMessagesStore((state) => state.loading.detail === true);
  const [panel, setPanel] = useState<Panel>('details');
  const [choice, setChoice] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPanel('details');
    setChoice(null);
    setNote('');
    if (!messageId) return;
    useMessagesStore.getState().markMessageRead(messageId);
    void useMessagesStore.getState().fetchMessageDetails(messageId, { bypassCache: true });
  }, [messageId]);

  const message = loaded ?? fallback;
  if (!message) {
    return isLoading ? (
      <HStack space="sm" className="items-center justify-center py-8" testID="message-details-loading">
        <Spinner size="small" />
      </HStack>
    ) : (
      <Text className="py-8 text-center text-typography-500" testID="message-details-missing">
        {t('messages.not_found')}
      </Text>
    );
  }

  const expired = isMessageExpired(message.ExpiredOn);
  const canRespond = canRespondToMessage(message, isOwn);
  const rsvp = isCalendarRsvp(message) && !expired && !isOwn;
  const sender = message.IsSystem ? t('messages.system_sender') : message.SendingName || t('messages.unknown_sender');
  const recipients = message.Recipients ?? [];
  const myResponseKey = message.Responded ? getResponseKey(message.ResponseType) : null;

  const respond = async (type: number, responseNote: string) => {
    setBusy(true);
    const ok = await useMessagesStore.getState().respondToMessage({ Id: Number(message.MessageId), Type: type, Note: responseNote });
    setBusy(false);
    if (!ok) {
      toast.error(t('messages.respond_failed'));
      return;
    }
    toast.success(t('messages.response_sent'));
    setPanel('details');
    setChoice(null);
    setNote('');
    void useMessagesStore.getState().fetchInboxMessages({ bypassCache: true });
  };

  const remove = async () => {
    setBusy(true);
    const ok = await useMessagesStore.getState().deleteMessages([message.MessageId]);
    setBusy(false);
    if (!ok) {
      toast.error(t('messages.delete_failed'));
      return;
    }
    toast.success(t('messages.deleted'));
    onDeleted?.();
  };

  return (
    <VStack space="lg" testID="message-details">
      <VStack space="sm">
        {isWithheld(message.Subject) ? (
          <ProtectedLabel size="lg" testID="message-details-subject-protected" />
        ) : (
          <Text className="text-xl font-bold text-typography-900" accessibilityRole="header">
            {message.Subject || t('messages.no_subject')}
          </Text>
        )}
        <Text size="sm" className="text-typography-600">{`${t('messages.from')}: ${sender}`}</Text>
        <HStack space="sm" className="flex-wrap items-center">
          <Badge action={getMessageTypeAction(message.Type)} size="sm">
            <BadgeText>{t(getMessageTypeKey(message.Type))}</BadgeText>
          </Badge>
          {message.Responded ? (
            <Badge action="success" variant="outline" size="sm">
              <BadgeText>{t('messages.responded')}</BadgeText>
            </Badge>
          ) : null}
          {expired ? (
            <Badge action="error" variant="outline" size="sm" testID="message-details-expired">
              <BadgeText>{t('messages.expired')}</BadgeText>
            </Badge>
          ) : null}
          <HStack space="xs" className="items-center">
            <View>
              <Clock size={14} color={colors.textMuted} />
            </View>
            <Text size="xs" className="text-typography-500">
              {formatSentOn(message, locale)}
            </Text>
          </HStack>
        </HStack>
      </VStack>

      <Box className="rounded-lg bg-background-50 p-4">
        {isWithheld(message.Body) ? (
          <ProtectedLabel testID="message-details-body-protected" />
        ) : (
          <Text className="leading-relaxed text-typography-800" selectable testID="message-details-body">
            {message.Body || t('messages.no_content')}
          </Text>
        )}
      </Box>

      {message.ExpiredOn ? (
        <VStack space="xs">
          <Text className="font-semibold text-typography-900">{t('messages.expires_on')}</Text>
          <Text className="text-typography-600">{formatUtc(message.ExpiredOn, locale)}</Text>
        </VStack>
      ) : null}

      {myResponseKey || (message.Responded && message.ResponseType) ? (
        <VStack space="xs" testID="message-details-my-response">
          <Text className="font-semibold text-typography-900">{t('messages.your_response')}</Text>
          <Text className="text-typography-700">{myResponseKey ? t(myResponseKey) : message.ResponseType}</Text>
          {message.Note ? <Text className="text-typography-600">{message.Note}</Text> : null}
        </VStack>
      ) : null}

      {rsvp ? (
        <VStack space="sm">
          <Text className="font-semibold text-typography-900">{t('messages.calendar_rsvp')}</Text>
          <HStack space="sm">
            <Button
              action="positive"
              variant={message.ResponseType === 'Yes' ? 'solid' : 'outline'}
              className="flex-1"
              onPress={() => void respond(MessageResponseType.Yes, '')}
              isDisabled={busy}
              testID="message-rsvp-attending"
            >
              <ButtonText>{t('messages.attending')}</ButtonText>
            </Button>
            <Button
              action="negative"
              variant={message.ResponseType === 'No' ? 'solid' : 'outline'}
              className="flex-1"
              onPress={() => void respond(MessageResponseType.No, '')}
              isDisabled={busy}
              testID="message-rsvp-not-attending"
            >
              <ButtonText>{t('messages.not_attending')}</ButtonText>
            </Button>
          </HStack>
        </VStack>
      ) : null}

      {panel === 'respond' ? (
        <VStack space="md" testID="message-respond-panel">
          <Text className="font-semibold text-typography-900">{t('messages.respond_to_message')}</Text>
          <HStack space="sm" accessibilityRole="radiogroup">
            {RESPONSE_CHOICES.map((option) => {
              const isSelected = choice === option.type;
              return (
                <Pressable
                  key={option.type}
                  onPress={() => setChoice(option.type)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  testID={`message-response-${option.type}`}
                  className={`flex-1 items-center rounded-lg border px-3 py-2 ${isSelected ? 'border-primary-600 bg-primary-100' : 'border-outline-300 bg-background-0'}`}
                >
                  <Text className={isSelected ? 'font-semibold text-primary-800' : 'text-typography-700'}>{t(option.key)}</Text>
                </Pressable>
              );
            })}
          </HStack>
          <VStack space="xs">
            <Text size="sm" className="font-medium text-typography-700">
              {t('messages.note_optional')}
            </Text>
            <Textarea>
              <TextareaInput value={note} onChangeText={setNote} placeholder={t('messages.enter_note')} accessibilityLabel={t('messages.note_optional')} testID="message-response-note" />
            </Textarea>
          </VStack>
          <HStack space="sm">
            <Button variant="outline" action="secondary" className="flex-1" onPress={() => setPanel('details')} isDisabled={busy} testID="message-respond-cancel">
              <ButtonText>{t('common.cancel')}</ButtonText>
            </Button>
            <Button className="flex-1" onPress={() => (choice === null ? undefined : void respond(choice, note.trim()))} isDisabled={busy || choice === null} testID="message-respond-send">
              {busy ? <ButtonSpinner /> : null}
              <ButtonText>{t('messages.send_response')}</ButtonText>
            </Button>
          </HStack>
        </VStack>
      ) : panel === 'delete' ? (
        <VStack space="md" testID="message-delete-panel">
          <Text className="text-typography-800">{t('messages.delete_single_confirmation_message')}</Text>
          <HStack space="sm">
            <Button variant="outline" action="secondary" className="flex-1" onPress={() => setPanel('details')} isDisabled={busy} testID="message-delete-cancel">
              <ButtonText>{t('common.cancel')}</ButtonText>
            </Button>
            <Button action="negative" className="flex-1" onPress={() => void remove()} isDisabled={busy} testID="message-delete-confirm">
              {busy ? <ButtonSpinner /> : null}
              <ButtonText>{t('messages.delete')}</ButtonText>
            </Button>
          </HStack>
        </VStack>
      ) : (
        <HStack space="sm" className="flex-wrap">
          {canRespond ? (
            <Button onPress={() => setPanel('respond')} testID="message-respond-button">
              <View>
                <Reply size={16} color={colors.textInverse} />
              </View>
              <ButtonText>{t('messages.respond')}</ButtonText>
            </Button>
          ) : null}
          <Button variant="outline" action="negative" onPress={() => setPanel('delete')} testID="message-delete-button">
            <View>
              <Trash2 size={16} color={colors.error} />
            </View>
            <ButtonText>{t('messages.delete')}</ButtonText>
          </Button>
        </HStack>
      )}

      {recipients.length > 0 ? (
        <VStack space="sm" testID="message-details-recipients">
          <Text className="font-semibold text-typography-900">{`${t('messages.recipients')} (${recipients.length})`}</Text>
          {recipients.map((recipient) => {
            const responseKey = getResponseKey(recipient.Response);
            return (
              <VStack key={recipient.UserId || recipient.Name} space="xs" className="rounded-lg bg-background-50 p-3" testID={`message-recipient-${recipient.UserId}`}>
                <Text className="font-medium text-typography-900">{recipient.Name || t('messages.unknown_sender')}</Text>
                {recipient.RespondedOn ? (
                  <HStack space="xs" className="items-center">
                    <View>
                      <Check size={12} color={colors.success} />
                    </View>
                    {/* Core reports the recipient's read receipt (ReadOn) here; answering also sets it. */}
                    <Text size="xs" className="text-success-700">{`${t('messages.read_on')}: ${formatUtc(recipient.RespondedOn, locale)}`}</Text>
                  </HStack>
                ) : null}
                {recipient.Response ? <Text size="sm" className="text-typography-700">{`${t('messages.response')}: ${responseKey ? t(responseKey) : recipient.Response}`}</Text> : null}
                {recipient.Note ? (
                  <Text size="sm" className="text-typography-600">
                    {recipient.Note}
                  </Text>
                ) : null}
              </VStack>
            );
          })}
        </VStack>
      ) : null}
    </VStack>
  );
};
