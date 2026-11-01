import { useTranslation } from '@resgrid/i18n';
import React, { useEffect, useState } from 'react';

import type { AdHocPersonnelInput, AdHocUnitInput } from '../../lib/events';
import { ChoiceChips } from './choice-chips';
import { FieldLabel, SheetForm, TextField } from './sheet-form';

type AdHocKind = 'unit' | 'personnel';

export interface AdHocResourceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateUnit: (input: AdHocUnitInput) => void;
  onCreatePersonnel: (input: AdHocPersonnelInput) => void;
}

/** Add a resource that is not in Resgrid — a mutual-aid engine or an external person (IC add-resource sheet). */
export const AdHocResourceSheet: React.FC<AdHocResourceSheetProps> = ({ isOpen, onClose, onCreateUnit, onCreatePersonnel }) => {
  const { t } = useTranslation();
  const [kind, setKind] = useState<AdHocKind>('unit');
  const [name, setName] = useState('');
  const [typeOrRole, setTypeOrRole] = useState('');
  const [agency, setAgency] = useState('');
  const [contact, setContact] = useState('');

  useEffect(() => {
    if (isOpen) {
      setKind('unit');
      setName('');
      setTypeOrRole('');
      setAgency('');
      setContact('');
    }
  }, [isOpen]);

  const submit = () => {
    if (!name.trim()) return;
    if (kind === 'unit') onCreateUnit({ name, type: typeOrRole, agency });
    else onCreatePersonnel({ name, role: typeOrRole, agency, contact });
  };

  return (
    <SheetForm
      isOpen={isOpen}
      onClose={onClose}
      title={t('incident_command.add_adhoc_title')}
      description={t('incident_command.add_adhoc_description')}
      submitLabel={t('common.add')}
      onSubmit={submit}
      isSubmitDisabled={!name.trim()}
      testID="adhoc-sheet"
    >
      <FieldLabel text={t('incident_command.adhoc_kind')} />
      <ChoiceChips
        choices={[
          { value: 'unit' as AdHocKind, label: t('incident_command.resource_kind_adhoc_unit') },
          { value: 'personnel' as AdHocKind, label: t('incident_command.resource_kind_adhoc_personnel') },
        ]}
        selected={kind}
        onSelect={setKind}
        accessibilityLabel={t('incident_command.adhoc_kind')}
        testID="adhoc-sheet-kind"
      />
      <TextField label={t('incident_command.adhoc_name')} value={name} onChangeText={setName} testID="adhoc-sheet-name" />
      <TextField label={kind === 'unit' ? t('incident_command.adhoc_unit_type') : t('incident_command.adhoc_role')} value={typeOrRole} onChangeText={setTypeOrRole} optional testID="adhoc-sheet-type" />
      <TextField label={t('incident_command.adhoc_agency')} value={agency} onChangeText={setAgency} optional testID="adhoc-sheet-agency" />
      {kind === 'personnel' ? <TextField label={t('incident_command.adhoc_contact')} value={contact} onChangeText={setContact} optional testID="adhoc-sheet-contact" /> : null}
    </SheetForm>
  );
};
