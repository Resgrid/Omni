import { useCallsStore, useProtocolsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallQuickTemplateResultData } from '@resgrid/models';
import { Button, ButtonText, Input, InputField, Pressable, Text } from '@resgrid/ui';
import { Check } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { LinkedCallRef } from '../../lib/call-form';
import { CallModalFrame } from '../call-modal-frame';

/** Call quick templates (Dispatch): fill name, nature, type and priority from a template. */
export const CallTemplatesModal: React.FC<{ isOpen: boolean; onClose: () => void; templates: readonly CallQuickTemplateResultData[]; onSelect: (template: CallQuickTemplateResultData) => void }> = ({
  isOpen,
  onClose,
  templates,
  onSelect,
}) => {
  const { t } = useTranslation();
  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={t('calls.templates.title')} testID="call-templates">
      <View style={styles.panel}>
        {templates.length === 0 ? <Text className="text-typography-500">{t('calls.templates.empty')}</Text> : null}
        {templates.map((template) => (
          <Pressable
            key={template.Id}
            onPress={() => {
              onSelect(template);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel={template.Name}
            testID={`call-template-${template.Id}`}
            className="mb-2 rounded-lg border border-outline-100 p-3"
          >
            <Text className="font-semibold text-typography-900">{template.Name}</Text>
            <Text size="xs" className="text-typography-500">
              {[template.CallName, template.CallType].filter(Boolean).join(' · ')}
            </Text>
          </Pressable>
        ))}
      </View>
    </CallModalFrame>
  );
};

/** Link the new call to an open call (Dispatch linked calls); undefined in the request when this picker is absent. */
export const LinkedCallModal: React.FC<{ isOpen: boolean; onClose: () => void; selectedCallId?: string | null; excludeCallId?: string; onSelect: (call: LinkedCallRef | null) => void }> = ({
  isOpen,
  onClose,
  selectedCallId,
  excludeCallId,
  onSelect,
}) => {
  const { t } = useTranslation();
  const calls = useCallsStore((state) => state.calls);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = calls.filter((call) => call.CallId !== excludeCallId && (!needle || `${call.Number} ${call.Name}`.toLowerCase().includes(needle)));
  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={t('calls.linked_call')} testID="linked-call">
      <View style={styles.panel}>
        <Input variant="outline" size="sm" className="mb-2">
          <InputField value={query} onChangeText={setQuery} placeholder={t('calls.search')} accessibilityLabel={t('calls.search')} />
        </Input>
        {selectedCallId ? (
          <Button
            variant="outline"
            size="sm"
            className="mb-2 self-start"
            onPress={() => {
              onSelect(null);
              onClose();
            }}
            accessibilityLabel={t('calls.linked.clear')}
          >
            <ButtonText>{t('calls.linked.clear')}</ButtonText>
          </Button>
        ) : null}
        {visible.length === 0 ? <Text className="text-typography-500">{t('calls.no_open_calls')}</Text> : null}
        {visible.map((call) => (
          <Pressable
            key={call.CallId}
            onPress={() => {
              onSelect({ callId: call.CallId, number: call.Number, name: call.Name });
              onClose();
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: call.CallId === selectedCallId }}
            accessibilityLabel={`#${call.Number} ${call.Name}`}
            testID={`linked-call-${call.CallId}`}
            className={`mb-1 rounded-md px-2 py-2 ${call.CallId === selectedCallId ? 'bg-primary-50' : ''}`}
          >
            <Text className="text-typography-900">{`#${call.Number} ${call.Name}`}</Text>
          </Pressable>
        ))}
      </View>
    </CallModalFrame>
  );
};

/** Pick protocols for the call (Dispatch protocol selector); an array (even empty) is sent and enforced by the server. */
export const ProtocolSelectorModal: React.FC<{ isOpen: boolean; onClose: () => void; selected: readonly number[]; onConfirm: (ids: number[]) => void }> = ({ isOpen, onClose, selected, onConfirm }) => {
  const { t } = useTranslation();
  const protocols = useProtocolsStore((state) => state.protocols);
  const fetchProtocols = useProtocolsStore((state) => state.fetchProtocols);
  const [draft, setDraft] = useState<number[]>([...selected]);

  useEffect(() => {
    if (isOpen) {
      setDraft([...selected]);
      void fetchProtocols();
    }
  }, [fetchProtocols, isOpen, selected]);

  const options = useMemo(
    () =>
      protocols
        .filter((protocol) => !protocol.IsDisabled)
        .map((protocol) => ({ id: Number(protocol.Id), name: protocol.Name, code: protocol.Code }))
        .filter((option) => Number.isFinite(option.id)),
    [protocols]
  );

  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={t('calls.protocols.select')} testID="protocol-selector">
      <View style={styles.panel}>
        {options.length === 0 ? <Text className="text-typography-500">{t('protocols.empty')}</Text> : null}
        {options.map((option) => {
          const checked = draft.includes(option.id);
          return (
            <Pressable
              key={option.id}
              onPress={() => setDraft((current) => (current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id]))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={option.code ? `${option.name}, ${option.code}` : option.name}
              testID={`protocol-option-${option.id}`}
              className="flex-row items-center px-2 py-2"
            >
              <View style={StyleSheet.flatten([styles.checkbox, checked ? styles.checkboxOn : null])}>{checked ? <Check size={14} color="#FFFFFF" /> : null}</View>
              <Text className="text-typography-900">{option.code ? `${option.name} (${option.code})` : option.name}</Text>
            </Pressable>
          );
        })}
        <Button
          className="mt-4"
          onPress={() => {
            onConfirm(draft);
            onClose();
          }}
          accessibilityLabel={t('common.done')}
          testID="protocol-selector-confirm"
        >
          <ButtonText>{t('common.done')}</ButtonText>
        </Button>
      </View>
    </CallModalFrame>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  checkboxOn: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
});
