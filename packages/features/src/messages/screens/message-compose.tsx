import { useSecurity } from '@resgrid/auth';
import { useMessagesStore } from '@resgrid/data';
import { emptyRecipientSelection, RecipientPickerModal, summarizeRecipientSelection } from '@resgrid/features/calls';
import { useTranslation } from '@resgrid/i18n';
import {
  Button,
  ButtonSpinner,
  ButtonText,
  HStack,
  Input,
  InputField,
  KeyboardAwareScrollView,
  Pressable,
  ScreenHeader,
  Text,
  Textarea,
  TextareaInput,
  useThemeColors,
  useToast,
  View,
  VStack,
  ZeroState,
} from '@resgrid/ui';
import { usePreventRemove, useRouter } from 'expo-router';
import { ChevronRight, Users } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View as RNView } from 'react-native';

import { COMPOSABLE_MESSAGE_TYPES, getMessageTypeKey, isEveryoneRecipient, messageRecipientCount, type MessageRecipientSelection, MessageType, recipientSections, toMessageRecipients } from '../lib/message-format';
import { messageRoutes } from '../routes';

interface FormErrors {
  subject?: boolean;
  body?: boolean;
  recipients?: boolean;
}

/**
 * Compose (`/messages/new`, Responder): subject, body, type (message / callback / poll) and recipients — everyone, or
 * people, groups and roles, picked in the same recipient picker a call's dispatch uses. Sending goes through the outbox,
 * so it works offline: the message waits on the device and is sent on reconnect (exactly once). Core does not message
 * units, so they are not offered. Leaving with a draft (Cancel, the app bar's back, Android back) asks first.
 */
export default function MessageComposeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const toast = useToast();
  const { rights, canUserCreateMessages } = useSecurity();
  const recipients = useMessagesStore((state) => state.recipients);
  const isRecipientsLoading = useMessagesStore((state) => state.loading.recipients === true);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<number>(MessageType.Normal);
  const [selection, setSelection] = useState<MessageRecipientSelection>(emptyRecipientSelection);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [isSending, setIsSending] = useState(false);
  /** The navigation a draft held back (back button, gesture), replayed on Discard. */
  const blockedLeave = useRef<(() => void) | null>(null);

  useEffect(() => {
    void useMessagesStore.getState().fetchRecipients({ includeUnits: false });
  }, []);

  const hasEveryone = useMemo(() => recipients.some(isEveryoneRecipient), [recipients]);

  const sections = useMemo(
    () => recipientSections(recipients, { personnel: t('messages.recipient_tabs.personnel'), groups: t('messages.recipient_tabs.groups'), roles: t('messages.recipient_tabs.roles') }),
    [recipients, t]
  );

  const recipientCount = messageRecipientCount(selection);
  const isDirty = subject.trim() !== '' || body.trim() !== '' || recipientCount > 0 || type !== MessageType.Normal;

  const disablePrevention = usePreventRemove(isDirty, ({ repeat }) => {
    blockedLeave.current = repeat;
    setConfirmDiscard(true);
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace(messageRoutes.list()));

  const clear = () => {
    setSubject('');
    setBody('');
    setType(MessageType.Normal);
    setSelection(emptyRecipientSelection());
    setErrors({});
    setConfirmDiscard(false);
  };

  /** Leaves without asking again: after Discard, or once the message is sent or queued. */
  const leave = () => {
    const replay = blockedLeave.current;
    blockedLeave.current = null;
    clear();

    if (replay) {
      replay();

      return;
    }

    disablePrevention();
    back();
  };

  const cancel = () => {
    if (isDirty) {
      setConfirmDiscard(true);

      return;
    }

    back();
  };

  const keepEditing = () => {
    blockedLeave.current = null;
    setConfirmDiscard(false);
  };

  const pickRecipients = (next: MessageRecipientSelection) => {
    setSelection(next);
    setIsPickerOpen(false);

    if (messageRecipientCount(next) > 0) setErrors((current) => ({ ...current, recipients: false }));
  };

  const send = async () => {
    const next: FormErrors = { subject: !subject.trim(), body: !body.trim(), recipients: recipientCount === 0 };
    setErrors(next);

    if (next.subject || next.body || next.recipients) return;
    setIsSending(true);

    // The outbox can also fail to queue it (no session, a storage failure): null, and the page stays to try again.
    const result = await useMessagesStore
      .getState()
      .sendNewMessage({
        Title: subject.trim(),
        Body: body.trim(),
        Type: type,
        Recipients: toMessageRecipients(selection, recipients),
      })
      .catch(() => null);

    setIsSending(false);

    if (result === null || result.outcome === 'rejected') {
      toast.error(t('messages.send_failed'));

      return;
    }

    toast.success(result.outcome === 'sent' ? t('messages.send_success') : t('messages.queued_offline'));
    blockedLeave.current = null;
    leave();
  };

  const header = <ScreenHeader title={t('messages.compose_new_message')} onBack={back} testID="message-compose-header" />;

  if (rights !== null && !canUserCreateMessages) {
    return (
      <View className="flex-1 bg-background-0" testID="message-compose-screen">
        {header}
        <ZeroState isError heading={t('common.permission_denied')} description={t('errors.data.forbidden')} testID="message-compose-not-allowed" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background-0" testID="message-compose-screen">
      {header}

      {confirmDiscard ? (
        <VStack space="sm" className="border-b border-outline-200 bg-background-warning p-4" testID="compose-discard-confirm">
          <Text className="font-semibold text-typography-900">{t('messages.unsaved_changes')}</Text>
          <Text size="sm" className="text-typography-700">
            {t('messages.unsaved_changes_message')}
          </Text>
          <HStack space="sm">
            <Button size="sm" variant="outline" action="secondary" onPress={keepEditing} testID="compose-keep-editing">
              <ButtonText>{t('messages.keep_editing')}</ButtonText>
            </Button>
            <Button size="sm" action="negative" onPress={leave} testID="compose-discard">
              <ButtonText>{t('messages.discard')}</ButtonText>
            </Button>
          </HStack>
        </VStack>
      ) : null}

      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <VStack space="lg">
          <VStack space="xs">
            <Text size="sm" className="font-medium text-typography-700">
              {t('messages.message_type')}
            </Text>
            <HStack space="sm" accessibilityRole="radiogroup">
              {COMPOSABLE_MESSAGE_TYPES.map((value) => {
                const isSelected = type === value;

                return (
                  <Pressable
                    key={value}
                    onPress={() => setType(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    testID={`compose-type-${value}`}
                    className={`rounded-full border px-3 py-1.5 ${isSelected ? 'border-primary-600 bg-primary-100' : 'border-outline-300 bg-background-0'}`}
                  >
                    <Text size="sm" className={isSelected ? 'font-semibold text-primary-800' : 'text-typography-700'}>
                      {t(getMessageTypeKey(value))}
                    </Text>
                  </Pressable>
                );
              })}
            </HStack>
            {type !== MessageType.Normal ? (
              <Text size="xs" className="text-typography-500">
                {t('messages.response_types_hint')}
              </Text>
            ) : null}
          </VStack>

          <VStack space="xs">
            <Text size="sm" className="font-medium text-typography-700">
              {t('messages.subject')}
            </Text>
            <Input variant="outline" isInvalid={errors.subject === true}>
              <InputField value={subject} onChangeText={setSubject} placeholder={t('messages.enter_subject')} accessibilityLabel={t('messages.subject')} maxLength={250} testID="compose-subject" />
            </Input>
            {errors.subject ? (
              <Text size="xs" className="text-error-600" testID="compose-subject-error">
                {t('messages.validation.subject_required')}
              </Text>
            ) : null}
          </VStack>

          <VStack space="xs">
            <Text size="sm" className="font-medium text-typography-700">
              {t('messages.message_body')}
            </Text>
            <Textarea isInvalid={errors.body === true} className="h-48">
              <TextareaInput value={body} onChangeText={setBody} placeholder={t('messages.enter_message_body')} accessibilityLabel={t('messages.message_body')} testID="compose-body" />
            </Textarea>
            {errors.body ? (
              <Text size="xs" className="text-error-600" testID="compose-body-error">
                {t('messages.validation.body_required')}
              </Text>
            ) : null}
          </VStack>

          <VStack space="sm">
            <HStack className="items-center justify-between">
              <HStack space="xs" className="items-center">
                <RNView>
                  <Users size={16} color={colors.icon} />
                </RNView>
                <Text size="sm" className="font-medium text-typography-700">
                  {t('messages.recipients')}
                </Text>
              </HStack>
              <Text size="xs" className="text-typography-500" testID="compose-recipient-count">
                {t('messages.recipients_selected', { count: recipientCount })}
              </Text>
            </HStack>
            <Pressable
              onPress={() => setIsPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('messages.select_recipients')}
              className={`flex-row items-center rounded-lg border p-3 ${errors.recipients ? 'border-error-600' : 'border-outline-200'}`}
              testID="compose-recipients"
            >
              <RNView style={styles.pickerText}>
                <Text className="text-typography-900">{t('messages.select_recipients')}</Text>
                <Text size="xs" className="text-typography-500" numberOfLines={2} testID="compose-recipient-summary">
                  {summarizeRecipientSelection(selection, sections, { everyone: t('messages.everyone'), none: t('common.none') })}
                </Text>
              </RNView>
              <RNView>
                <ChevronRight size={18} color={colors.icon} />
              </RNView>
            </Pressable>
            {errors.recipients ? (
              <Text size="xs" className="text-error-600" testID="compose-recipients-error">
                {t('messages.validation.recipients_required')}
              </Text>
            ) : null}
          </VStack>

          <HStack space="sm" className="pt-2">
            <Button variant="outline" action="secondary" className="flex-1" onPress={cancel} isDisabled={isSending} testID="compose-cancel">
              <ButtonText>{t('common.cancel')}</ButtonText>
            </Button>
            <Button className="flex-1" onPress={() => void send()} isDisabled={isSending} testID="compose-send">
              {isSending ? <ButtonSpinner /> : null}
              <ButtonText>{t('messages.send')}</ButtonText>
            </Button>
          </HStack>
        </VStack>
      </KeyboardAwareScrollView>

      <RecipientPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        title={t('messages.select_recipients')}
        sections={sections}
        value={selection}
        onConfirm={pickRecipients}
        everyoneLabel={hasEveryone ? t('messages.everyone') : null}
        everyoneName={t('messages.everyone')}
        isLoading={isRecipientsLoading}
        testID="compose-recipient-picker"
        optionTestID="recipient"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  pickerText: { flex: 1, marginRight: 8 },
});
