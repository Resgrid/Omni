import { useCommandSupportStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Loading, Pressable, Switch, Text, Textarea, TextareaInput, VStack } from '@resgrid/ui';
import { ClipboardList, LayoutTemplate } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { safeColor } from '../../lib/labels';
import { ChoiceChips } from './choice-chips';
import { SheetForm } from './sheet-form';

export interface StartCommandSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Start from a department template, or a blank board (null). */
  onStart: (commandDefinitionId: number | null) => void;
}

/**
 * Template picker for establishing command (IC start-command sheet): department ICS templates (a structure fire, or an
 * event with lanes like Medical Booth / Patrols). Offline, or when templates cannot load, the blank board still works.
 */
export const StartCommandSheet: React.FC<StartCommandSheetProps> = ({ isOpen, onClose, onStart }) => {
  const { t } = useTranslation();
  const definitions = useCommandSupportStore((state) => state.definitions);
  const isLoading = useCommandSupportStore((state) => state.loading.definitions === true);
  const fetchCommandDefinitions = useCommandSupportStore((state) => state.fetchCommandDefinitions);

  useEffect(() => {
    if (isOpen) void fetchCommandDefinitions();
  }, [fetchCommandDefinitions, isOpen]);

  const start = (id: number | null) => {
    onClose();
    onStart(id);
  };

  return (
    <SheetForm isOpen={isOpen} onClose={onClose} title={t('incident_command.start_command')} description={t('incident_command.start_command_description')} snapPoint={70} testID="start-command-sheet">
      <VStack space="sm">
        <Pressable onPress={() => start(null)} accessibilityRole="button" accessibilityLabel={t('incident_command.template_blank')} className="rounded-lg bg-background-50 px-3 py-3" testID="start-command-blank">
          <HStack className="items-center" space="sm">
            <View>
              <ClipboardList size={22} color="#2563eb" />
            </View>
            <VStack className="flex-1">
              <Text className="font-medium text-typography-900">{t('incident_command.template_blank')}</Text>
              <Text className="text-sm text-typography-500">{t('incident_command.template_blank_description')}</Text>
            </VStack>
          </HStack>
        </Pressable>
        {isLoading && definitions.length === 0 ? <Loading text="" /> : null}
        {definitions.map((definition) => (
          <Pressable
            key={definition.CommandDefinitionId}
            onPress={() => start(definition.CommandDefinitionId)}
            accessibilityRole="button"
            accessibilityLabel={definition.Name}
            className="rounded-lg bg-background-50 px-3 py-3"
            testID={`start-command-template-${definition.CommandDefinitionId}`}
          >
            <HStack className="items-center" space="sm">
              <View>
                <LayoutTemplate size={22} color="#2563eb" />
              </View>
              <VStack className="flex-1">
                <Text className="font-medium text-typography-900">{definition.Name}</Text>
                {definition.Description ? <Text className="text-sm text-typography-500">{definition.Description}</Text> : null}
                <Text className="text-xs text-typography-400">{t('incident_command.template_lane_count', { count: definition.Lanes?.length ?? 0 })}</Text>
                {(definition.Lanes ?? []).some((lane) => lane.Color) ? (
                  <View style={styles.swatches}>
                    {(definition.Lanes ?? [])
                      .filter((lane) => lane.Color)
                      .slice(0, 8)
                      .map((lane) => (
                        <View key={lane.CommandDefinitionRoleId} style={StyleSheet.flatten([styles.swatch, { backgroundColor: safeColor(lane.Color) }])} />
                      ))}
                  </View>
                ) : null}
              </VStack>
            </HStack>
          </Pressable>
        ))}
      </VStack>
    </SheetForm>
  );
};

/** Call close types (CallStates 1–7), the calls feature's list and keys (not imported: calls registers this feature). */
const CLOSE_TYPES = [
  { value: 1, labelKey: 'call_detail.close_call_types.closed' },
  { value: 2, labelKey: 'call_detail.close_call_types.cancelled' },
  { value: 3, labelKey: 'call_detail.close_call_types.unfounded' },
  { value: 4, labelKey: 'call_detail.close_call_types.founded' },
  { value: 5, labelKey: 'call_detail.close_call_types.minor' },
  { value: 6, labelKey: 'call_detail.close_call_types.transferred' },
  { value: 7, labelKey: 'call_detail.close_call_types.false_alarm' },
] as const;

export interface EndCommandCloseCall {
  type: number;
  notes: string;
  sendNotification: boolean;
}

export interface EndCommandDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Offer "also close the call" (rights CanCreateCalls + the variant may close calls). */
  canCloseCall: boolean;
  onConfirm: (closeCall: EndCommandCloseCall | null) => void;
}

/**
 * End command (IC end-command dialog). Ending closes the command and drops the local board; a member who may close calls
 * can close the call in the same step — it is queued behind the command close and never sent after a refused one.
 */
export const EndCommandDialog: React.FC<EndCommandDialogProps> = ({ isOpen, onClose, canCloseCall, onConfirm }) => {
  const { t } = useTranslation();
  const [alsoClose, setAlsoClose] = useState(false);
  const [closeType, setCloseType] = useState<number>(1);
  const [notes, setNotes] = useState('');
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setAlsoClose(false);
      setCloseType(1);
      setNotes('');
      setNotify(true);
    }
  }, [isOpen]);

  const closesCall = canCloseCall && alsoClose;

  return (
    <SheetForm
      isOpen={isOpen}
      onClose={onClose}
      title={t('incident_command.end_command_title')}
      description={t('incident_command.end_command_message')}
      submitLabel={closesCall ? t('incident_command.end_command_and_close_call') : t('incident_command.end_command')}
      submitAction="negative"
      onSubmit={() => onConfirm(closesCall ? { type: closeType, notes: notes.trim(), sendNotification: notify } : null)}
      snapPoint={closesCall ? 80 : 45}
      testID="end-command-dialog"
    >
      {canCloseCall ? (
        <HStack className="mt-2 items-center justify-between" space="sm">
          <VStack className="flex-1">
            <Text className="text-sm font-medium text-typography-900">{t('incident_command.end_command_close_call')}</Text>
            <Text className="text-xs text-typography-500">{t('incident_command.end_command_close_call_hint')}</Text>
          </VStack>
          <Switch value={alsoClose} onValueChange={setAlsoClose} accessibilityLabel={t('incident_command.end_command_close_call')} testID="end-command-close-call" />
        </HStack>
      ) : null}
      {closesCall ? (
        <VStack space="sm" className="mt-3" testID="end-command-close-options">
          <Text className="text-sm font-medium text-typography-700">{t('call_detail.close_call_type')}</Text>
          <ChoiceChips
            choices={CLOSE_TYPES.map((type) => ({ value: type.value as number, label: t(type.labelKey) }))}
            selected={closeType}
            onSelect={setCloseType}
            accessibilityLabel={t('call_detail.close_call_type')}
            testID="end-command-close-type"
          />
          <Textarea size="md">
            <TextareaInput value={notes} onChangeText={setNotes} placeholder={t('call_detail.close_call_note_placeholder')} accessibilityLabel={t('call_detail.close_call_note')} testID="end-command-close-note" />
          </Textarea>
          <HStack className="items-center justify-between" space="sm">
            <Text className="flex-1 text-sm text-typography-900">{t('call_detail.close_call_notify')}</Text>
            <Switch value={notify} onValueChange={setNotify} accessibilityLabel={t('call_detail.close_call_notify')} testID="end-command-notify" />
          </HStack>
        </VStack>
      ) : null}
    </SheetForm>
  );
};

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', marginTop: 4 },
  swatch: { width: 10, height: 10, borderRadius: 5, marginRight: 4 },
});
