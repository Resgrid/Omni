import { personnelFullName } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, Input, InputField, Pressable, Switch, Text } from '@resgrid/ui';
import { Check } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DispatchRecipients } from '../hooks/use-call-form-data';
import { type DispatchSelection, dispatchSelectionCount, EMPTY_DISPATCH_SELECTION } from '../lib/call-form';
import { CallModalFrame } from './call-modal-frame';

type Section = 'users' | 'groups' | 'roles' | 'units';

interface Entry {
  id: string;
  name: string;
  detail?: string;
}

export interface DispatchSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipients: DispatchRecipients;
  value: DispatchSelection;
  onConfirm: (selection: DispatchSelection) => void;
  /** "Everyone" is not offered for pending calls (a blank list pages everyone). */
  allowEveryone?: boolean;
}

const SECTION_KEYS: Record<Section, string> = { users: 'calls.users', groups: 'calls.groups', roles: 'calls.roles', units: 'calls.units' };

/** Who to dispatch (R + D selection): personnel, groups, roles and units, with search and an "Everyone" switch. */
export const DispatchSelectionModal: React.FC<DispatchSelectionModalProps> = ({ isOpen, onClose, recipients, value, onConfirm, allowEveryone = true }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DispatchSelection>(value);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDraft(value);
      setQuery('');
    }
  }, [isOpen, value]);

  const sections = useMemo<Record<Section, Entry[]>>(
    () => ({
      users: recipients.personnel.map((person) => ({ id: person.UserId, name: personnelFullName(person) || person.UserId, detail: person.GroupName })),
      groups: recipients.groups.map((group) => ({ id: group.GroupId, name: group.Name })),
      roles: [...recipients.roles].sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0)).map((role) => ({ id: role.RoleId, name: role.Name })),
      units: recipients.units.map((unit) => ({ id: unit.UnitId, name: unit.Name, detail: unit.GroupName || unit.Type })),
    }),
    [recipients]
  );

  const needle = query.trim().toLowerCase();
  const toggle = (section: Section, id: string) =>
    setDraft((current) => ({ ...current, everyone: false, [section]: current[section].includes(id) ? current[section].filter((value) => value !== id) : [...current[section], id] }));

  const count = dispatchSelectionCount(draft);

  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={t('calls.select_dispatch_recipients')} testID="dispatch-selection">
      <View style={styles.panel}>
        {allowEveryone ? (
          <View style={styles.everyone}>
            <Text className="flex-1 font-medium text-typography-900">{t('calls.dispatch_to_everyone')}</Text>
            <Switch
              value={draft.everyone}
              onValueChange={(everyone: boolean) => setDraft(everyone ? { ...EMPTY_DISPATCH_SELECTION, everyone: true } : { ...draft, everyone: false })}
              accessibilityLabel={t('calls.dispatch_to_everyone')}
              testID="dispatch-selection-everyone"
            />
          </View>
        ) : null}
        <Input variant="outline" size="sm" className="mb-2">
          <InputField value={query} onChangeText={setQuery} placeholder={t('common.search')} accessibilityLabel={t('common.search')} testID="dispatch-selection-search" />
        </Input>
        {(Object.keys(sections) as Section[]).map((section) => {
          const entries = sections[section].filter((entry) => !needle || entry.name.toLowerCase().includes(needle) || entry.detail?.toLowerCase().includes(needle));
          if (entries.length === 0) return null;
          return (
            <View key={section} style={styles.section} testID={`dispatch-selection-${section}`}>
              <Text size="sm" className="mb-1 font-semibold uppercase text-typography-500" accessibilityRole="header">
                {`${t(SECTION_KEYS[section])} (${draft[section].length})`}
              </Text>
              {entries.map((entry) => {
                const checked = draft[section].includes(entry.id);
                return (
                  <Pressable
                    key={entry.id}
                    onPress={() => toggle(section, entry.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={entry.detail ? `${entry.name}, ${entry.detail}` : entry.name}
                    testID={`dispatch-option-${section}-${entry.id}`}
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
        })}
        <Button className="mt-4" onPress={() => onConfirm(draft)} accessibilityLabel={t('common.done')} testID="dispatch-selection-confirm">
          <ButtonText>{draft.everyone ? `${t('common.done')} — ${t('calls.everyone')}` : `${t('common.done')} (${count} ${t('calls.selected')})`}</ButtonText>
        </Button>
      </View>
    </CallModalFrame>
  );
};

/** One-line summary of a dispatch selection for the form ("Everyone" / "Engine 1, Station 2 +3"). */
export function summarizeDispatchSelection(value: DispatchSelection, recipients: DispatchRecipients, labels: { everyone: string; none: string }): string {
  if (value.everyone) return labels.everyone;
  const names = [
    ...value.users.map((id) => {
      const person = recipients.personnel.find((candidate) => candidate.UserId === id);
      return person ? personnelFullName(person) : id;
    }),
    ...value.groups.map((id) => recipients.groups.find((group) => group.GroupId === id)?.Name ?? id),
    ...value.roles.map((id) => recipients.roles.find((role) => role.RoleId === id)?.Name ?? id),
    ...value.units.map((id) => recipients.units.find((unit) => unit.UnitId === id)?.Name ?? id),
  ];
  if (names.length === 0) return labels.none;
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
}

const styles = StyleSheet.create({
  panel: { padding: 16 },
  everyone: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  section: { marginTop: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  checkboxOn: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  entryBody: { flex: 1 },
});
