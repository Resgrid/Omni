import { useMessagesStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { RecipientsResultData } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, CustomBottomSheet, HStack, Input, InputField, Pressable, Spinner, Text, Textarea, TextareaInput, useThemeColors, useToast, VStack } from '@resgrid/ui';
import { CheckSquare, Square, Users } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { COMPOSABLE_MESSAGE_TYPES, getMessageTypeKey, isEveryoneRecipient, MessageType, recipientInputType, recipientsForTab, type RecipientTab } from '../lib/message-format';

export interface ComposeMessageSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const TABS: readonly { key: RecipientTab; labelKey: string }[] = [
  { key: 'personnel', labelKey: 'messages.recipient_tabs.personnel' },
  { key: 'groups', labelKey: 'messages.recipient_tabs.groups' },
  { key: 'roles', labelKey: 'messages.recipient_tabs.roles' },
];

interface FormErrors {
  subject?: boolean;
  body?: boolean;
  recipients?: boolean;
}

const RecipientRow: React.FC<{ recipient: RecipientsResultData; selected: boolean; onToggle: (recipient: RecipientsResultData) => void }> = ({ recipient, selected, onToggle }) => {
  const colors = useThemeColors();
  const Icon = selected ? CheckSquare : Square;
  return (
    <Pressable
      onPress={() => onToggle(recipient)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={recipient.Name}
      testID={`recipient-${recipient.Id}`}
      className={`mb-2 flex-row items-center rounded-lg border px-3 py-2 ${selected ? 'border-primary-500 bg-primary-50' : 'border-outline-200 bg-background-0'}`}
    >
      <View style={styles.rowIcon}>
        <Icon size={18} color={selected ? colors.primary : colors.icon} />
      </View>
      <Text size="sm" className="flex-1 text-typography-900">
        {recipient.Name}
      </Text>
    </Pressable>
  );
};

/**
 * Compose (Responder): subject, body, type (message / callback / poll) and recipients — everyone, or people, groups and
 * roles. Sending goes through the outbox, so it works offline: the message waits on the device and is sent on
 * reconnect (exactly once). Core does not message units, so they are not offered.
 */
export const ComposeMessageSheet: React.FC<ComposeMessageSheetProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const toast = useToast();
  const recipients = useMessagesStore((state) => state.recipients);
  const isRecipientsLoading = useMessagesStore((state) => state.loading.recipients === true);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<number>(MessageType.Normal);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tab, setTab] = useState<RecipientTab>('personnel');
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (isOpen) void useMessagesStore.getState().fetchRecipients({ includeUnits: false });
  }, [isOpen]);

  const everyone = useMemo(() => recipients.find(isEveryoneRecipient) ?? null, [recipients]);
  const visible = useMemo(() => recipientsForTab(recipients, tab, search), [recipients, tab, search]);
  const byId = useMemo(() => new Map(recipients.map((recipient) => [recipient.Id, recipient])), [recipients]);
  const selectedNames = selectedIds.map((id) => byId.get(id)?.Name).filter((name): name is string => !!name);
  const isDirty = subject.trim() !== '' || body.trim() !== '' || selectedIds.length > 0 || type !== MessageType.Normal;

  const reset = () => {
    setSubject('');
    setBody('');
    setType(MessageType.Normal);
    setSelectedIds([]);
    setSearch('');
    setErrors({});
    setConfirmDiscard(false);
  };

  const close = () => {
    if (isDirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    reset();
    onClose();
  };

  // "Everyone" stands alone: it already reaches every member.
  const toggle = (recipient: RecipientsResultData) => {
    setErrors((current) => ({ ...current, recipients: false }));
    setSelectedIds((current) => {
      if (current.includes(recipient.Id)) return current.filter((id) => id !== recipient.Id);
      if (isEveryoneRecipient(recipient)) return [recipient.Id];
      return [...current.filter((id) => !(everyone && id === everyone.Id)), recipient.Id];
    });
  };

  const send = async () => {
    const next: FormErrors = { subject: !subject.trim(), body: !body.trim(), recipients: selectedIds.length === 0 };
    setErrors(next);
    if (next.subject || next.body || next.recipients) return;
    setIsSending(true);
    const result = await useMessagesStore.getState().sendNewMessage({
      Title: subject.trim(),
      Body: body.trim(),
      Type: type,
      Recipients: selectedIds.map((id) => {
        const recipient = byId.get(id);
        return { Id: id, Type: recipient ? recipientInputType(recipient) : 1, Name: recipient?.Name ?? '' };
      }),
    });
    setIsSending(false);
    if (result.outcome === 'rejected') {
      toast.error(t('messages.send_failed'));
      return;
    }
    toast.success(result.outcome === 'sent' ? t('messages.send_success') : t('messages.queued_offline'));
    reset();
    onClose();
  };

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={close} snapPoints={[92]} testID="compose-message-sheet">
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <VStack space="md">
          <Text className="text-xl font-bold text-typography-900" accessibilityRole="header">
            {t('messages.compose_new_message')}
          </Text>

          {confirmDiscard ? (
            <VStack space="sm" className="rounded-lg bg-background-warning p-3" testID="compose-discard-confirm">
              <Text className="font-semibold text-typography-900">{t('messages.unsaved_changes')}</Text>
              <Text size="sm" className="text-typography-700">
                {t('messages.unsaved_changes_message')}
              </Text>
              <HStack space="sm">
                <Button size="sm" variant="outline" action="secondary" onPress={() => setConfirmDiscard(false)} testID="compose-keep-editing">
                  <ButtonText>{t('messages.keep_editing')}</ButtonText>
                </Button>
                <Button size="sm" action="negative" onPress={close} testID="compose-discard">
                  <ButtonText>{t('messages.discard')}</ButtonText>
                </Button>
              </HStack>
            </VStack>
          ) : null}

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
            <Textarea isInvalid={errors.body === true}>
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
                <View>
                  <Users size={16} color={colors.icon} />
                </View>
                <Text size="sm" className="font-medium text-typography-700">
                  {t('messages.recipients')}
                </Text>
              </HStack>
              <Text size="xs" className="text-typography-500" testID="compose-recipient-count">
                {t('messages.recipients_selected', { count: selectedIds.length })}
              </Text>
            </HStack>
            {selectedNames.length > 0 ? (
              <Text size="sm" className="text-typography-700" numberOfLines={2} testID="compose-recipient-names">
                {selectedNames.join(', ')}
              </Text>
            ) : null}
            {errors.recipients ? (
              <Text size="xs" className="text-error-600" testID="compose-recipients-error">
                {t('messages.validation.recipients_required')}
              </Text>
            ) : null}

            {everyone ? <RecipientRow recipient={{ ...everyone, Name: t('messages.everyone') }} selected={selectedIds.includes(everyone.Id)} onToggle={() => toggle(everyone)} /> : null}

            <HStack space="sm" accessibilityRole="tablist">
              {TABS.map((item) => {
                const isActive = tab === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setTab(item.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    testID={`compose-tab-${item.key}`}
                    className={`flex-1 items-center rounded-md border px-2 py-1.5 ${isActive ? 'border-primary-600 bg-primary-600' : 'border-outline-300 bg-background-0'}`}
                  >
                    <Text size="sm" className={isActive ? 'font-semibold text-typography-0' : 'text-typography-700'}>
                      {t(item.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </HStack>
            <Input variant="outline" size="sm">
              <InputField value={search} onChangeText={setSearch} placeholder={t('messages.search_recipients')} accessibilityLabel={t('messages.search_recipients')} testID="compose-recipient-search" />
            </Input>
            {isRecipientsLoading && recipients.length === 0 ? (
              <HStack className="justify-center py-4">
                <Spinner size="small" testID="compose-recipients-loading" />
              </HStack>
            ) : visible.length === 0 ? (
              <Text size="sm" className="py-2 text-typography-500" testID="compose-recipients-empty">
                {t('messages.no_recipients')}
              </Text>
            ) : (
              <VStack>
                {visible.map((recipient) => (
                  <RecipientRow key={recipient.Id} recipient={recipient} selected={selectedIds.includes(recipient.Id)} onToggle={toggle} />
                ))}
              </VStack>
            )}
          </VStack>

          <HStack space="sm" className="pt-2">
            <Button variant="outline" action="secondary" className="flex-1" onPress={close} isDisabled={isSending} testID="compose-cancel">
              <ButtonText>{t('common.cancel')}</ButtonText>
            </Button>
            <Button className="flex-1" onPress={() => void send()} isDisabled={isSending} testID="compose-send">
              {isSending ? <ButtonSpinner /> : null}
              <ButtonText>{t('messages.send')}</ButtonText>
            </Button>
          </HStack>
        </VStack>
      </ScrollView>
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%' },
  content: { paddingBottom: 40 },
  rowIcon: { marginRight: 8 },
});
