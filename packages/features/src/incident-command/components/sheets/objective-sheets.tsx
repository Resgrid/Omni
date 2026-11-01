import { useTranslation } from '@resgrid/i18n';
import { type TacticalObjective, TacticalObjectiveOutcome, TacticalObjectiveStatus, TacticalObjectiveType } from '@resgrid/models';
import { Button, ButtonText, Text } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ObjectiveInput } from '../../lib/events';
import { OBJECTIVE_TYPES, objectiveTypeName } from '../../lib/labels';
import { PercentBar } from '../percent-bar';
import { ChoiceChips } from './choice-chips';
import { FieldLabel, SheetForm, TextField } from './sheet-form';

export interface AddObjectiveSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: ObjectiveInput) => void;
}

/** New tactical objective or benchmark (IC objectives section add). */
export const AddObjectiveSheet: React.FC<AddObjectiveSheetProps> = ({ isOpen, onClose, onSave }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [type, setType] = useState<number>(TacticalObjectiveType.General);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setType(TacticalObjectiveType.General);
      setDescription('');
    }
  }, [isOpen]);

  return (
    <SheetForm
      isOpen={isOpen}
      onClose={onClose}
      title={t('incident_command.add_objective')}
      submitLabel={t('common.add')}
      onSubmit={() => (name.trim() ? onSave({ name, objectiveType: type, description }) : undefined)}
      isSubmitDisabled={!name.trim()}
      testID="objective-sheet"
    >
      <TextField label={t('incident_command.objective_name')} value={name} onChangeText={setName} placeholder={t('incident_command.objective_name_placeholder')} testID="objective-sheet-name" />
      <FieldLabel text={t('incident_command.objective_type')} />
      <ChoiceChips
        choices={OBJECTIVE_TYPES.map((value) => ({ value: value as number, label: objectiveTypeName(t, value) }))}
        selected={type}
        onSelect={setType}
        accessibilityLabel={t('incident_command.objective_type')}
        testID="objective-sheet-type"
      />
      <TextField label={t('incident_command.objective_description')} value={description} onChangeText={setDescription} optional multiline testID="objective-sheet-description" />
    </SheetForm>
  );
};

const PROGRESS_STEPS = [0, 25, 50, 75] as const;

const OUTCOMES = [TacticalObjectiveOutcome.Successful, TacticalObjectiveOutcome.Partial, TacticalObjectiveOutcome.Unsuccessful] as const;

const OUTCOME_KEYS: Record<number, string> = {
  [TacticalObjectiveOutcome.Successful]: 'incident_command.outcome_successful',
  [TacticalObjectiveOutcome.Partial]: 'incident_command.outcome_partial',
  [TacticalObjectiveOutcome.Unsuccessful]: 'incident_command.outcome_unsuccessful',
};

export interface ObjectiveDetailsSheetProps {
  objective: TacticalObjective | null;
  onClose: () => void;
  canManage: boolean;
  onProgress: (objective: TacticalObjective, percent: number) => void;
  onComplete: (objective: TacticalObjective, outcome: number, note: string) => void;
}

/** An objective's detail with progress steps and close-out (IC objective-details sheet). */
export const ObjectiveDetailsSheet: React.FC<ObjectiveDetailsSheetProps> = ({ objective, onClose, canManage, onProgress, onComplete }) => {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<number>(TacticalObjectiveOutcome.Successful);
  const [note, setNote] = useState('');
  const objectiveId = objective?.TacticalObjectiveId;

  useEffect(() => {
    setOutcome(TacticalObjectiveOutcome.Successful);
    setNote('');
  }, [objectiveId]);

  const isComplete = objective?.Status === TacticalObjectiveStatus.Complete;

  return (
    <SheetForm isOpen={!!objective} onClose={onClose} title={objective?.Name ?? ''} snapPoint={70} testID="objective-details-sheet">
      {objective ? (
        <View>
          <Text className="text-sm text-typography-500">{objectiveTypeName(t, objective.ObjectiveType)}</Text>
          {objective.Description ? <Text className="mt-1 text-sm text-typography-900">{objective.Description}</Text> : null}
          <PercentBar percent={isComplete ? 100 : objective.ProgressPercent} testID="objective-details-progress" />
          {isComplete ? (
            <Text className="mt-3 text-sm font-medium text-success-700" testID="objective-details-complete">
              {objective.CompletionNote ? t('incident_command.objective_completed_note', { note: objective.CompletionNote }) : t('incident_command.objective_status_complete')}
            </Text>
          ) : canManage ? (
            <View>
              <FieldLabel text={t('incident_command.objective_progress')} />
              <View style={styles.row}>
                {PROGRESS_STEPS.map((step) => (
                  <Button
                    key={step}
                    size="sm"
                    variant={Math.round(objective.ProgressPercent) === step ? 'solid' : 'outline'}
                    className="mb-2 mr-2"
                    onPress={() => onProgress(objective, step)}
                    accessibilityLabel={t('incident_command.set_progress', { percent: step })}
                    testID={`objective-details-progress-${step}`}
                  >
                    <ButtonText>{t('incident_command.percent', { percent: step })}</ButtonText>
                  </Button>
                ))}
              </View>
              <FieldLabel text={t('incident_command.objective_outcome')} />
              <ChoiceChips
                choices={OUTCOMES.map((value) => ({ value: value as number, label: t(OUTCOME_KEYS[value]) }))}
                selected={outcome}
                onSelect={setOutcome}
                accessibilityLabel={t('incident_command.objective_outcome')}
                testID="objective-details-outcome"
              />
              <TextField label={t('incident_command.objective_completion_note')} value={note} onChangeText={setNote} optional multiline testID="objective-details-note" />
              <Button className="mt-3" action="positive" onPress={() => onComplete(objective, outcome, note)} testID="objective-details-complete-button">
                <ButtonText>{t('incident_command.complete_objective')}</ButtonText>
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}
    </SheetForm>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
});
