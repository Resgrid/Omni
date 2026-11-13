import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, Input, InputField, Pressable, Spinner, Switch, Text, useReadableColor } from '@resgrid/ui';
import { Check } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  everyoneRecipientSelection,
  isRecipientListed,
  matchesRecipientQuery,
  offeredRecipientSelection,
  pickedCount,
  pickedIds,
  type RecipientPickerBadge,
  type RecipientPickerChip,
  type RecipientPickerSection,
  type RecipientPickerSelection,
  toggleRecipient,
} from '../lib/recipient-picker';
import { CallModalFrame } from './call-modal-frame';

export {
  emptyRecipientSelection,
  everyoneRecipientSelection,
  type RecipientPickerBadge,
  type RecipientPickerChip,
  type RecipientPickerEntry,
  type RecipientPickerSection,
  type RecipientPickerSelection,
  summarizeRecipientSelection,
} from '../lib/recipient-picker';

export interface RecipientPickerModalProps<K extends string> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** The lists to pick from. None at all (each one hidden by the department) leaves only the "Everyone" switch and `header`. */
  sections: readonly RecipientPickerSection<K>[];
  value: RecipientPickerSelection<K>;
  onConfirm: (selection: RecipientPickerSelection<K>) => void;
  /** Label of the "Everyone" switch, which picks everyone and clears the rest; null when everyone may not be picked (a `value` with it is then confirmed without it). */
  everyoneLabel: string | null;
  /** How the Done button names an "everyone" selection. */
  everyoneName: string;
  /** The recipients are still loading: shown instead of "no results" while no section has entries. */
  isLoading?: boolean;
  /** The modal's test id; its parts are `${testID}-search`, `-everyone`, `-confirm`, `-empty` and `-${section key}`. */
  testID: string;
  /** Each entry's test id is `${optionTestID}-${section key}-${entry id}`; its parts add `-metric`, `-note`, `-badge-${tone}`. */
  optionTestID: string;
  /** Controls above the search (the dispatch picker's sort and filter, its ranking hint). */
  header?: React.ReactNode;
}

const BADGE_CLASSES: Record<RecipientPickerBadge['tone'], { box: string; text: string }> = {
  nearest: { box: 'bg-success-100', text: 'text-success-800' },
  runCard: { box: 'bg-info-100', text: 'text-info-800' },
};

/** A coloured dot and the label in a readable version of the same colour. */
const EntryChip: React.FC<{ chip: RecipientPickerChip }> = ({ chip }) => {
  const readable = useReadableColor();

  return (
    <View style={styles.chip}>
      <View style={StyleSheet.flatten([styles.chipDot, { backgroundColor: readable.mark(chip.color) }])} />
      <Text size="xs" className="font-medium" style={{ color: readable.text(chip.color) }} numberOfLines={1}>
        {chip.label}
      </Text>
    </View>
  );
};

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
  header,
}: RecipientPickerModalProps<K>): React.ReactElement {
  const { t } = useTranslation();
  const everyoneOffered = everyoneLabel !== null;
  const [draft, setDraft] = useState<RecipientPickerSelection<K>>(value);
  const [query, setQuery] = useState('');

  // Only opening (or a new `value`) resets the draft. Whether "Everyone" is offered can change while the picker is open
  // (a message's recipients finish loading), so it is applied where the draft is shown and confirmed, never by a reset
  // that would throw away the picks and the search.
  useEffect(() => {
    if (isOpen) {
      setDraft(value);
      setQuery('');
    }
  }, [isOpen, value]);

  // A filtered-out entry stays listed while it is picked, so a pick never disappears from view.
  const visible = useMemo(
    () =>
      sections
        .map((section) => ({ ...section, entries: section.entries.filter((entry) => isRecipientListed(entry, pickedIds(draft, section.key)) && matchesRecipientQuery(entry, query)) }))
        .filter((section) => section.entries.length > 0),
    [sections, query, draft]
  );

  const hasEntries = sections.some((section) => section.entries.length > 0);
  // No lists at all (a department hiding every one) leaves only the "Everyone" switch and the header: no search, no list.
  const offersLists = sections.length > 0;
  const count = pickedCount(draft, sections);
  const isEveryone = everyoneOffered && draft.everyone;
  const doneLabel = isEveryone ? `${t('common.done')} — ${everyoneName}` : offersLists ? `${t('common.done')} (${count} ${t('calls.selected')})` : t('common.done');

  return (
    <CallModalFrame
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      testID={testID}
      footer={
        <View className="border-t border-outline-100 bg-background-0 p-4">
          <Button onPress={() => onConfirm(offeredRecipientSelection(draft, everyoneOffered))} accessibilityLabel={t('common.done')} testID={`${testID}-confirm`}>
            <ButtonText>{doneLabel}</ButtonText>
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
        {header}
        {offersLists ? (
          <Input variant="outline" size="sm" className="mb-2">
            <InputField value={query} onChangeText={setQuery} placeholder={t('common.search')} accessibilityLabel={t('common.search')} testID={`${testID}-search`} />
          </Input>
        ) : null}
        {!offersLists ? null : isLoading && !hasEntries ? (
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
                  const entryTestID = `${optionTestID}-${section.key}-${entry.id}`;
                  const spoken = [entry.name, ...(entry.badges ?? []).map((badge) => badge.label), entry.metric, entry.detail].filter(Boolean).join(', ');

                  return (
                    <Pressable
                      key={entry.id}
                      onPress={() => setDraft((current) => toggleRecipient(current, section.key, entry.id))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={spoken}
                      testID={entryTestID}
                      className={`flex-row items-center rounded-md px-2 py-2 ${checked ? 'bg-primary-50' : ''}`}
                      style={entry.muted ? styles.muted : undefined}
                    >
                      <View style={StyleSheet.flatten([styles.checkbox, checked ? styles.checkboxOn : null])}>{checked ? <Check size={14} color="#FFFFFF" /> : null}</View>
                      <View style={styles.entryBody}>
                        <View style={styles.titleRow}>
                          <View style={styles.titleName}>
                            <Text className="shrink text-typography-900" numberOfLines={1}>
                              {entry.name}
                            </Text>
                            {(entry.badges ?? []).map((badge) => (
                              <View key={badge.tone} className={`ml-2 rounded-full px-2 py-0.5 ${BADGE_CLASSES[badge.tone].box}`} testID={`${entryTestID}-badge-${badge.tone}`}>
                                <Text size="xs" className={`font-semibold ${BADGE_CLASSES[badge.tone].text}`}>
                                  {badge.label}
                                </Text>
                              </View>
                            ))}
                          </View>
                          {entry.metric ? (
                            <Text size="sm" className="ml-2 font-semibold text-typography-900" testID={`${entryTestID}-metric`}>
                              {entry.metric}
                            </Text>
                          ) : null}
                        </View>
                        {entry.chips?.length ? (
                          <View style={styles.chips}>
                            {entry.chips.map((chip, index) => (
                              <EntryChip key={`${index}-${chip.label}`} chip={chip} />
                            ))}
                          </View>
                        ) : null}
                        {entry.detail ? (
                          <Text size="xs" className="text-typography-500">
                            {entry.detail}
                          </Text>
                        ) : null}
                        {entry.subDetail ? (
                          <Text size="xs" className="text-typography-500" numberOfLines={2}>
                            {entry.subDetail}
                          </Text>
                        ) : null}
                        {entry.note ? (
                          <Text size="xs" className="text-warning-700" testID={`${entryTestID}-note`}>
                            {entry.note}
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleName: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  chipDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  muted: { opacity: 0.7 },
});
