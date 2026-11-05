import { personnelFullName } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import React, { useMemo } from 'react';

import type { DispatchRecipients } from '../hooks/use-call-form-data';
import { type DispatchSelection, EMPTY_DISPATCH_SELECTION } from '../lib/call-form';
import { pickedIds, type RecipientPickerEntry, type RecipientPickerSection, type RecipientPickerSelection, summarizeRecipientSelection } from '../lib/recipient-picker';
import { RecipientPickerModal } from './recipient-picker';

type Section = 'users' | 'groups' | 'roles' | 'units';

export interface DispatchSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipients: DispatchRecipients;
  value: DispatchSelection;
  onConfirm: (selection: DispatchSelection) => void;
  /** "Everyone" is not offered for pending calls: the dispatcher who sends one picks its recipients. */
  allowEveryone?: boolean;
}

const SECTIONS: readonly Section[] = ['users', 'groups', 'roles', 'units'];

const SECTION_KEYS: Record<Section, string> = { users: 'calls.users', groups: 'calls.groups', roles: 'calls.roles', units: 'calls.units' };

/** The picker's entries for a call's possible recipients: personnel by full name, roles in their sort order. */
function dispatchEntries(recipients: DispatchRecipients): Record<Section, RecipientPickerEntry[]> {
  return {
    users: recipients.personnel.map((person) => ({ id: person.UserId, name: personnelFullName(person) || person.UserId, detail: person.GroupName })),
    groups: recipients.groups.map((group) => ({ id: group.GroupId, name: group.Name })),
    roles: [...recipients.roles].sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0)).map((role) => ({ id: role.RoleId, name: role.Name })),
    units: recipients.units.map((unit) => ({ id: unit.UnitId, name: unit.Name, detail: unit.GroupName || unit.Type })),
  };
}

const toPickerSelection = (value: DispatchSelection): RecipientPickerSelection<Section> => ({ everyone: value.everyone, ids: { users: value.users, groups: value.groups, roles: value.roles, units: value.units } });

const fromPickerSelection = (value: RecipientPickerSelection<Section>): DispatchSelection =>
  value.everyone
    ? { ...EMPTY_DISPATCH_SELECTION, everyone: true }
    : { everyone: false, users: [...pickedIds(value, 'users')], groups: [...pickedIds(value, 'groups')], roles: [...pickedIds(value, 'roles')], units: [...pickedIds(value, 'units')] };

/** Who to dispatch (R + D selection): personnel, groups, roles and units in the shared recipient picker, with an "Everyone" switch. */
export const DispatchSelectionModal: React.FC<DispatchSelectionModalProps> = ({ isOpen, onClose, recipients, value, onConfirm, allowEveryone = true }) => {
  const { t } = useTranslation();

  const sections = useMemo<RecipientPickerSection<Section>[]>(() => {
    const entries = dispatchEntries(recipients);

    return SECTIONS.map((key) => ({ key, label: t(SECTION_KEYS[key]), entries: entries[key] }));
  }, [recipients, t]);

  const selection = useMemo(() => toPickerSelection(value), [value]);

  return (
    <RecipientPickerModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('calls.select_dispatch_recipients')}
      sections={sections}
      value={selection}
      onConfirm={(next) => onConfirm(fromPickerSelection(next))}
      everyoneLabel={allowEveryone ? t('calls.dispatch_to_everyone') : null}
      everyoneName={t('calls.everyone')}
      testID="dispatch-selection"
      optionTestID="dispatch-option"
    />
  );
};

/** One-line summary of a dispatch selection for the form ("Everyone" / "Engine 1, Station 2 +3"). */
export function summarizeDispatchSelection(value: DispatchSelection, recipients: DispatchRecipients, labels: { everyone: string; none: string }): string {
  const entries = dispatchEntries(recipients);

  return summarizeRecipientSelection(
    toPickerSelection(value),
    SECTIONS.map((key) => ({ key, entries: entries[key] })),
    labels
  );
}
