import { useTranslation } from '@resgrid/i18n';
import { type IncidentNeed, IncidentNeedCategory, IncidentNeedStatus } from '@resgrid/models';
import { Text } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { NeedInput } from '../../lib/events';
import { NEED_CATEGORIES, NEED_STATUSES, needCategoryName, needStatusName } from '../../lib/labels';
import { ChoiceChips } from './choice-chips';
import { FieldLabel, parseCount, SheetForm, TextField } from './sheet-form';

export interface AddNeedSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: NeedInput) => void;
}

/** A command-level need tracked to fulfilment (IC needs section add). */
export const AddNeedSheet: React.FC<AddNeedSheetProps> = ({ isOpen, onClose, onSave }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<number>(IncidentNeedCategory.Resource);
  const [quantity, setQuantity] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setCategory(IncidentNeedCategory.Resource);
      setQuantity('');
      setDescription('');
    }
  }, [isOpen]);

  return (
    <SheetForm
      isOpen={isOpen}
      onClose={onClose}
      title={t('incident_command.add_need')}
      submitLabel={t('common.add')}
      onSubmit={() => (name.trim() ? onSave({ name, category, quantityRequested: parseCount(quantity), description }) : undefined)}
      isSubmitDisabled={!name.trim()}
      testID="need-sheet"
    >
      <TextField label={t('incident_command.need_name')} value={name} onChangeText={setName} placeholder={t('incident_command.need_name_placeholder')} testID="need-sheet-name" />
      <FieldLabel text={t('incident_command.need_category')} />
      <ChoiceChips
        choices={NEED_CATEGORIES.map((value) => ({ value: value as number, label: needCategoryName(t, value) }))}
        selected={category}
        onSelect={setCategory}
        accessibilityLabel={t('incident_command.need_category')}
        testID="need-sheet-category"
      />
      <TextField label={t('incident_command.need_quantity')} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" optional testID="need-sheet-quantity" />
      <TextField label={t('incident_command.need_description')} value={description} onChangeText={setDescription} optional multiline testID="need-sheet-description" />
    </SheetForm>
  );
};

export interface NeedStatusSheetProps {
  need: IncidentNeed | null;
  onClose: () => void;
  onSave: (need: IncidentNeed, status: number, quantityFulfilled: number | null, note: string) => void;
}

/** Update a need's fulfilment: status, fulfilled quantity (may go down when a fill is called off) and an audit note. */
export const NeedStatusSheet: React.FC<NeedStatusSheetProps> = ({ need, onClose, onSave }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<number>(IncidentNeedStatus.Open);
  const [fulfilled, setFulfilled] = useState('');
  const [note, setNote] = useState('');
  const needId = need?.IncidentNeedId;

  useEffect(() => {
    setStatus(need?.Status ?? IncidentNeedStatus.Open);
    setFulfilled(need && need.QuantityRequested > 0 ? String(need.QuantityFulfilled ?? 0) : '');
    setNote('');
    // Reset only when another need opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needId]);

  const quantified = !!need && need.QuantityRequested > 0;

  return (
    <SheetForm
      isOpen={!!need}
      onClose={onClose}
      title={need?.Name ?? ''}
      submitLabel={t('common.save')}
      onSubmit={() => (need ? onSave(need, status, quantified ? parseCount(fulfilled) : null, note) : undefined)}
      testID="need-status-sheet"
    >
      {need ? (
        <View>
          <Text className="text-sm text-typography-500">{needCategoryName(t, need.Category)}</Text>
          {need.Description ? <Text className="mt-1 text-sm text-typography-900">{need.Description}</Text> : null}
          <FieldLabel text={t('incident_command.need_status')} />
          <ChoiceChips
            choices={NEED_STATUSES.map((value) => ({ value: value as number, label: needStatusName(t, value) }))}
            selected={status}
            onSelect={setStatus}
            accessibilityLabel={t('incident_command.need_status')}
            testID="need-status-sheet-status"
          />
          {quantified ? (
            <TextField
              label={t('incident_command.need_fulfilled_of', { requested: need.QuantityRequested })}
              value={fulfilled}
              onChangeText={setFulfilled}
              keyboardType="number-pad"
              testID="need-status-sheet-fulfilled"
            />
          ) : null}
          <TextField label={t('incident_command.need_update_note')} value={note} onChangeText={setNote} optional testID="need-status-sheet-note" />
        </View>
      ) : null}
    </SheetForm>
  );
};
