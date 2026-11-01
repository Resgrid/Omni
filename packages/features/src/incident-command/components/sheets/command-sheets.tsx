import { useTranslation } from '@resgrid/i18n';
import { IncidentContentVisibility, IncidentRoleType } from '@resgrid/models';
import { Button, ButtonText, DateTimeField } from '@resgrid/ui';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { CommandDetailsInput } from '../../lib/events';
import { ALL_INCIDENT_ROLES, ICS_ROLE_PRESETS, incidentRoleName } from '../../lib/labels';
import { ChoiceChips } from './choice-chips';
import { type PersonOption, PersonPicker } from './person-picker';
import { FieldLabel, SheetForm, TextField } from './sheet-form';

const TIMER_MINUTES = [5, 10, 15, 20, 30, 60] as const;

export interface TimerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (name: string, intervalSeconds: number) => void;
}

/** Start a recurring incident timer (IC timers section): a name and an interval; it comes due and is acknowledged. */
export const TimerSheet: React.FC<TimerSheetProps> = ({ isOpen, onClose, onStart }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState<number>(20);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setMinutes(20);
    }
  }, [isOpen]);

  return (
    <SheetForm
      isOpen={isOpen}
      onClose={onClose}
      title={t('incident_command.start_timer')}
      submitLabel={t('incident_command.start_timer')}
      onSubmit={() => (name.trim() ? onStart(name, minutes * 60) : undefined)}
      isSubmitDisabled={!name.trim()}
      snapPoint={60}
      testID="timer-sheet"
    >
      <TextField label={t('incident_command.timer_name')} value={name} onChangeText={setName} placeholder={t('incident_command.timer_name_placeholder')} testID="timer-sheet-name" />
      <FieldLabel text={t('incident_command.timer_interval')} />
      <ChoiceChips
        choices={TIMER_MINUTES.map((value) => ({ value: value as number, label: t('incident_command.minutes_short', { minutes: value }) }))}
        selected={minutes}
        onSelect={setMinutes}
        accessibilityLabel={t('incident_command.timer_interval')}
        testID="timer-sheet-interval"
      />
    </SheetForm>
  );
};

export interface NoteSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (body: string, visibility: number, title: string) => void;
}

/** An operational status note — internal, or public (it may reach the public incident feed). */
export const NoteSheet: React.FC<NoteSheetProps> = ({ isOpen, onClose, onSave }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<number>(IncidentContentVisibility.Internal);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setBody('');
      setVisibility(IncidentContentVisibility.Internal);
    }
  }, [isOpen]);

  return (
    <SheetForm
      isOpen={isOpen}
      onClose={onClose}
      title={t('incident_command.add_note')}
      submitLabel={t('common.save')}
      onSubmit={() => (body.trim() ? onSave(body, visibility, title) : undefined)}
      isSubmitDisabled={!body.trim()}
      testID="note-sheet"
    >
      <TextField label={t('incident_command.note_title')} value={title} onChangeText={setTitle} optional testID="note-sheet-title" />
      <TextField label={t('incident_command.note_body')} value={body} onChangeText={setBody} multiline testID="note-sheet-body" />
      <FieldLabel text={t('incident_command.note_visibility')} />
      <ChoiceChips
        choices={[
          { value: IncidentContentVisibility.Internal as number, label: t('incident_command.note_internal') },
          { value: IncidentContentVisibility.Public as number, label: t('incident_command.note_public') },
        ]}
        selected={visibility}
        onSelect={setVisibility}
        accessibilityLabel={t('incident_command.note_visibility')}
        testID="note-sheet-visibility"
      />
    </SheetForm>
  );
};

export interface RoleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  people: PersonOption[];
  onAssign: (userId: string, roleType: number) => void;
}

/** Assign an ICS position to a member (IC add-assignment sheet; presets first, every position on request). */
export const RoleSheet: React.FC<RoleSheetProps> = ({ isOpen, onClose, people, onAssign }) => {
  const { t } = useTranslation();
  const [roleType, setRoleType] = useState<number>(IncidentRoleType.SafetyOfficer);
  const [userId, setUserId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRoleType(IncidentRoleType.SafetyOfficer);
      setUserId(null);
      setShowAll(false);
    }
  }, [isOpen]);

  const roles = showAll ? ALL_INCIDENT_ROLES : ICS_ROLE_PRESETS;

  return (
    <SheetForm
      isOpen={isOpen}
      onClose={onClose}
      title={t('incident_command.assign_role')}
      submitLabel={t('incident_command.assign')}
      onSubmit={() => (userId ? onAssign(userId, roleType) : undefined)}
      isSubmitDisabled={!userId}
      snapPoint={90}
      testID="role-sheet"
    >
      <FieldLabel text={t('incident_command.role_position')} />
      <ChoiceChips
        choices={roles.map((value) => ({ value: value as number, label: incidentRoleName(t, value) }))}
        selected={roleType}
        onSelect={setRoleType}
        accessibilityLabel={t('incident_command.role_position')}
        testID="role-sheet-role"
      />
      {showAll ? null : (
        <Button size="xs" variant="link" className="self-start" onPress={() => setShowAll(true)} testID="role-sheet-show-all">
          <ButtonText>{t('incident_command.show_all_positions')}</ButtonText>
        </Button>
      )}
      <FieldLabel text={t('incident_command.role_member')} />
      <PersonPicker people={people} selectedUserId={userId} onSelect={setUserId} testID="role-sheet-person" />
    </SheetForm>
  );
};

export interface TransferCommandSheetProps {
  isOpen: boolean;
  onClose: () => void;
  people: PersonOption[];
  currentCommanderUserId?: string | null;
  onTransfer: (userId: string, notes: string) => void;
}

/** Hand command to another member (IC + Dispatch transfer sheets); logged on the incident with the notes. */
export const TransferCommandSheet: React.FC<TransferCommandSheetProps> = ({ isOpen, onClose, people, currentCommanderUserId, onTransfer }) => {
  const { t } = useTranslation();
  const [userId, setUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      setUserId(null);
      setNotes('');
    }
  }, [isOpen]);

  return (
    <SheetForm
      isOpen={isOpen}
      onClose={onClose}
      title={t('incident_command.transfer_command')}
      description={t('incident_command.transfer_command_description')}
      submitLabel={t('incident_command.transfer')}
      onSubmit={() => (userId ? onTransfer(userId, notes) : undefined)}
      isSubmitDisabled={!userId}
      snapPoint={90}
      testID="transfer-sheet"
    >
      <PersonPicker people={people} selectedUserId={userId} onSelect={setUserId} excludeUserIds={currentCommanderUserId ? [currentCommanderUserId] : []} testID="transfer-sheet-person" />
      <TextField label={t('incident_command.transfer_notes')} value={notes} onChangeText={setNotes} optional multiline testID="transfer-sheet-notes" />
    </SheetForm>
  );
};

export interface CommandDetailsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  estimatedEndOn?: string | null;
  importantInformation?: string | null;
  onSave: (input: CommandDetailsInput) => void;
}

/** Details every resource sees (Core UpdateCommandDetails): important information and the estimated end. */
export const CommandDetailsSheet: React.FC<CommandDetailsSheetProps> = ({ isOpen, onClose, estimatedEndOn, importantInformation, onSave }) => {
  const { t } = useTranslation();
  const [info, setInfo] = useState('');
  const [endOn, setEndOn] = useState('');

  useEffect(() => {
    if (isOpen) {
      setInfo(importantInformation ?? '');
      setEndOn(estimatedEndOn ?? '');
    }
  }, [estimatedEndOn, importantInformation, isOpen]);

  return (
    <SheetForm
      isOpen={isOpen}
      onClose={onClose}
      title={t('incident_command.command_details')}
      submitLabel={t('common.save')}
      onSubmit={() => onSave({ importantInformation: info, estimatedEndOn: endOn || null })}
      snapPoint={70}
      testID="details-sheet"
    >
      <TextField label={t('incident_command.important_information')} value={info} onChangeText={setInfo} optional multiline testID="details-sheet-info" />
      <FieldLabel text={t('incident_command.estimated_end')} optional />
      <View>
        <DateTimeField value={endOn} onChange={setEndOn} label={t('incident_command.estimated_end')} mode="datetime" testID="details-sheet-end" />
      </View>
    </SheetForm>
  );
};
