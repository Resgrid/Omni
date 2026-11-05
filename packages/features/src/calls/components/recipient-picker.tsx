import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, Input, InputField, Pressable, Spinner, Switch, Text } from '@resgrid/ui';
import { Check } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { everyoneRecipientSelection, matchesRecipientQuery, pickedCount, pickedIds, type RecipientPickerSection, type RecipientPickerSelection, toggleRecipient } from '../lib/recipient-picker';
import { CallModalFrame } from './call-modal-frame';

export { emptyRecipientSelection, everyoneRecipientSelection, type RecipientPickerEntry, type RecipientPickerSection, type RecipientPickerSelection, summarizeRecipientSelection } from '../lib/recipient-picker';

export interface RecipientPickerModalProps<K extends string> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  sections: readonly RecipientPickerSection<K>[];
  value: RecipientPickerSelection<K>;
  onConfirm: (selection: RecipientPickerSelection<K>) => void;
  /** Label of the "Everyone" switch, which picks everyone and clears the rest; null when everyone may not be picked. */
  everyoneLabel: string | null;
  /** How the Done button names an "everyone" selection. */
  everyoneName: string;
  /** The recipients are still loading: shown instead of "no results" while no section has entries. */
  isLoading?: boolean;
  /** The modal's test id; its parts are `${testID}-search`, `-everyone`, `-confirm`, `-empty` and `-${section key}`. */
  testID: string;
  /** Each entry's test id is `${optionTestID}-${section key}-${entry id}`. */
  optionTestID: string;
}

/**
 * Pick who something goes to — a call's dispatch, a new message: an "Everyone" switch, a search and one checkbox list
 * per section (personnel, groups, roles, units…), each headed with how many of it are picked. Nothing is applied until
 * Done; closing the modal keeps the caller's selection as it was.
 */
export function RecipientPickerModal<K extends string>({
  isOpen,
  onClose,
  title,
  sections,
  value,
  onConfirm,
  everyoneLabel,
  everyoneName,
  isLoading = false,
  testID,
  optionTestID,
}: RecipientPickerModalProps<K>): React.ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<RecipientPickerSelection<K>>(value);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDraft(value);
      setQuery('');
    }
  }, [isOpen, value]);

  const visible = useMemo(
    () => sections.map((section) => ({ ...section, entries: section.entries.filter((entry) => matchesRecipientQuery(entry, query)) })).filter((section) => section.entries.length > 0),
    [sections, query]
  );

  const hasEntries = sections.some((section) => section.entries.length > 0);
  const count = pickedCount(draft, sections);
  const isEveryone = everyoneLabel !== null && draft.everyone;

  return (
    <CallModalFrame
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      testID={testID}
      footer={
        <View className="border-t border-outline-100 bg-background-0 p-4">
          <Button onPress={() => onConfirm(draft)} accessibilityLabel={t('common.done')} testID={`${testID}-confirm`}>
            <ButtonText>{isEveryone ? `${t('common.done')} — ${everyoneName}` : `${t('common.done')} (${count} ${t('calls.selected')})`}</ButtonText>
          </Button>
        </View>
      }
    >
      <View style={styles.panel}>
        {everyoneLabel !== null ? (
          <View style={styles.everyone}>
            <Text className="flex-1 font-medium text-typography-900">{everyoneLabel}</Text>
            <Switch
              value={draft.everyone}
              onValueChange={(everyone: boolean) => setDraft((current) => (everyone ? everyoneRecipientSelection<K>() : { ...current, everyone: false }))}
              accessibilityLabel={everyoneLabel}
              testID={`${testID}-everyone`}
            />
          </View>
        ) : null}
        <Input variant="outline" size="sm" className="mb-2">
          <InputField value={query} onChangeText={setQuery} placeholder={t('common.search')} accessibilityLabel={t('common.search')} testID={`${testID}-search`} />
        </Input>
        {isLoading && !hasEntries ? (
          <View style={styles.status}>
            <Spinner size="small" testID={`${testID}-loading`} />
          </View>
        ) : visible.length === 0 ? (
          <Text size="sm" className="py-2 text-typography-500" testID={`${testID}-empty`}>
            {t('common.no_results_found')}
          </Text>
        ) : (
          visible.map((section) => {
            const picked = pickedIds(draft, section.key);

            return (
              <View key={section.key} style={styles.section} testID={`${testID}-${section.key}`}>
                <Text size="sm" className="mb-1 font-semibold uppercase text-typography-500" accessibilityRole="header">
                  {`${section.label} (${picked.length})`}
                </Text>
                {section.entries.map((entry) => {
                  const checked = picked.includes(entry.id);

                  return (
                    <Pressable
                      key={entry.id}
                      onPress={() => setDraft((current) => toggleRecipient(current, section.key, entry.id))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={entry.detail ? `${entry.name}, ${entry.detail}` : entry.name}
                      testID={`${optionTestID}-${section.key}-${entry.id}`}
                      className={`flex-row items-center rounded-md px-2 py-2 ${checked ? 'bg-primary-50' : ''}`}
                    >
                      <View style={StyleSheet.flatten([styles.checkbox, checked ? styles.checkboxOn : null])}>{checked ? <Check size={14} color="#FFFFFF" /> : null}</View>
                      <View style={styles.entryBody}>
                        <Text className="text-typography-900">{entry.name}</Text>
                        {entry.detail ? (
                          <Text size="xs" className="text-typography-500">
                            {entry.detail}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })
        )}
      </View>
    </CallModalFrame>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16 },
  everyone: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  status: { alignItems: 'center', paddingVertical: 16 },
  section: { marginTop: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  checkboxOn: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  entryBody: { flex: 1 },
});
