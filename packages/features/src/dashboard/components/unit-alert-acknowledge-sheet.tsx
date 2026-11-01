import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { type UnitAlertAcknowledgementOutcome, useUnitsStore, useUnitStatusAlertsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { UnitStatusAlertAcknowledgementMode, type UnitStatusAlertAcknowledgementResultData } from '@resgrid/models';
import { Button, ButtonText, CustomBottomSheet, HStack, showToast, Text, Textarea, TextareaInput, View, VStack } from '@resgrid/ui';
import { BellOff, CircleCheck } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { formatElapsed } from '../lib/format';
import { type BoardUnit, requiresAcknowledgementNote, toAcknowledgedLevel, type UnitAlertAcknowledgementState, type UnitStatusAlert } from '../lib/unit-status-alerts';

/** Mirrors UnitStatusAlertAcknowledgement.MaxNoteLength on the server. */
export const MAX_ACKNOWLEDGEMENT_NOTE_LENGTH = 500;
/** Mute choices in minutes; 0 = until the unit changes status. */
export const MUTE_OPTIONS = [0, 15, 30, 60] as const;

export interface UnitAlertAcknowledgeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  unit: BoardUnit | null;
  alert: UnitStatusAlert | null;
  acknowledgement: UnitStatusAlertAcknowledgementResultData | null;
  acknowledgementState: UnitAlertAcknowledgementState;
  /** The department's UnitStatusAlertNoteRequirement. */
  noteRequirement: number;
}

/** A UTC wire time as device-local hours and minutes (shared UTC parser). */
const formatTime = (value: string | null, locale: string): string => formatUtcInDepartmentTime(value, null, { hour: '2-digit', minute: '2-digit' }, locale);

/**
 * Deal with a unit that sat in a status past its timer: mark it seen, mute it, and say why ("MUG not departed,
 * technical malfunction reported"). Online only; every board in the department sees the result.
 */
export const UnitAlertAcknowledgeSheet: React.FC<UnitAlertAcknowledgeSheetProps> = ({ isOpen, onClose, unit, alert, acknowledgement, acknowledgementState, noteRequirement }) => {
  const { t, i18n } = useTranslation();
  const acknowledge = useUnitStatusAlertsStore((state) => state.acknowledge);
  const clear = useUnitStatusAlertsStore((state) => state.clear);
  const [note, setNote] = useState('');
  const [muteMinutes, setMuteMinutes] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isCovered = acknowledgementState !== 'none' && acknowledgement !== null;
  const noteRequired = alert ? requiresAcknowledgementNote(noteRequirement, alert.level) : false;
  const noteMissing = noteRequired && note.trim().length === 0;

  // Seed from the note already on the alert (a second dispatcher adds to it) only when the sheet opens for a unit:
  // acknowledgements refetch on every push, and re-seeding then would throw away what is being typed.
  const initialNote = useRef('');
  useEffect(() => {
    initialNote.current = isCovered ? (acknowledgement?.Note ?? '') : '';
  }, [acknowledgement?.Note, isCovered]);
  const unitId = unit?.UnitId;
  useEffect(() => {
    if (isOpen && unitId) {
      setNote(initialNote.current);
      setMuteMinutes(0);
    }
  }, [isOpen, unitId]);

  const report = useCallback(
    (outcome: UnitAlertAcknowledgementOutcome, success: string) => {
      if (outcome.ok) {
        showToast('success', success);
        onClose();
        return;
      }
      switch (outcome.error) {
        case 'unit_alert_status_changed':
        case 'unit_alert_not_overdue':
          // The board is behind the unit: catch up so the row moves or disappears.
          void useUnitsStore.getState().fetchUnitInfos({ bypassCache: true });
          showToast('info', t(outcome.error === 'unit_alert_status_changed' ? 'unitAlerts.errorStatusChanged' : 'unitAlerts.errorNotOverdue'));
          onClose();
          break;
        case 'unit_alert_conflict':
          showToast('info', t('unitAlerts.errorConflict'));
          onClose();
          break;
        case 'unit_alert_note_required':
          // Stays open: the department started asking for a reason after this board loaded its settings.
          showToast('error', t('unitAlerts.errorNoteRequired'));
          break;
        case 'offline':
          showToast('error', t('dashboard.acknowledge_offline'));
          break;
        default:
          showToast('error', t('unitAlerts.errorGeneric'));
      }
    },
    [onClose, t]
  );

  const submit = useCallback(
    async (mode: UnitStatusAlertAcknowledgementMode) => {
      if (!unit || !alert || alert.level === 'none' || noteMissing) return;
      const unitIdNumber = Number(unit.UnitId);
      const stateId = unit.CurrentUnitStateId ?? 0;
      if (!Number.isFinite(unitIdNumber) || stateId <= 0) return;
      setIsSubmitting(true);
      try {
        const outcome = await acknowledge({
          UnitId: unitIdNumber,
          UnitStateId: stateId,
          Level: toAcknowledgedLevel(alert.level),
          Mode: mode,
          MuteMinutes: mode === UnitStatusAlertAcknowledgementMode.Muted ? muteMinutes : 0,
          Note: note.trim(),
        });
        report(outcome, t(mode === UnitStatusAlertAcknowledgementMode.Muted ? 'unitAlerts.muteSuccess' : 'unitAlerts.acknowledgeSuccess'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [acknowledge, alert, muteMinutes, note, noteMissing, report, t, unit]
  );

  const handleClear = useCallback(async () => {
    if (!acknowledgement) return;
    setIsSubmitting(true);
    try {
      report(await clear(acknowledgement), t('unitAlerts.clearSuccess'));
    } finally {
      setIsSubmitting(false);
    }
  }, [acknowledgement, clear, report, t]);

  const levelColor = alert?.level === 'alert' ? '#dc2626' : '#d97706';
  const seenBy = acknowledgement?.AcknowledgedByName ? t('unitAlerts.acknowledgedBy', { name: acknowledgement.AcknowledgedByName }) : t('unitAlerts.acknowledged');
  const muteDescription =
    acknowledgementState === 'muted' ? (acknowledgement?.MutedUntilUtc ? t('unitAlerts.mutedUntil', { time: formatTime(acknowledgement.MutedUntilUtc, i18n.language) }) : t('unitAlerts.mutedUntilStatusChange')) : null;
  const noteLabel = noteRequired ? t('unitAlerts.noteRequired') : t('unitAlerts.note');

  return (
    <CustomBottomSheet isOpen={isOpen ? unit !== null && alert !== null : false} onClose={onClose} isLoading={isSubmitting} testID="unit-alert-acknowledge-sheet">
      {unit && alert ? (
        <VStack className="w-full p-4" space="md">
          <Text className="text-center text-lg font-semibold text-typography-900">{t('unitAlerts.sheetTitle')}</Text>
          <VStack space="xs">
            <Text className="text-base font-semibold text-typography-900">{unit.Name}</Text>
            <Text className="text-sm font-semibold" style={{ color: levelColor }}>
              {t('unitAlerts.inStatusFor', { status: unit.CurrentStatus || t('common.unknown'), elapsed: formatElapsed(alert.secondsInStatus) })}
            </Text>
          </VStack>

          {isCovered ? (
            <View className="rounded bg-background-100 p-3" testID="unit-alert-current-acknowledgement">
              <HStack space="sm" className="items-center">
                <View>{acknowledgementState === 'muted' ? <BellOff size={16} color={levelColor} /> : <CircleCheck size={16} color={levelColor} />}</View>
                <Text className="text-sm font-semibold text-typography-900">{seenBy}</Text>
              </HStack>
              {muteDescription ? <Text className="mt-1 text-xs text-typography-600">{muteDescription}</Text> : null}
              {acknowledgement?.Note ? <Text className="mt-1 text-sm text-typography-800">{acknowledgement.Note}</Text> : null}
              <Button variant="outline" action="negative" size="xs" className="mt-2 self-start" onPress={handleClear} isDisabled={isSubmitting} testID="unit-alert-clear-button">
                <ButtonText>{t('unitAlerts.clear')}</ButtonText>
              </Button>
            </View>
          ) : null}

          <VStack space="xs">
            <Text className="text-sm font-medium text-typography-800">{noteLabel}</Text>
            <Textarea>
              <TextareaInput
                placeholder={t('unitAlerts.notePlaceholder')}
                value={note}
                onChangeText={setNote}
                maxLength={MAX_ACKNOWLEDGEMENT_NOTE_LENGTH}
                numberOfLines={3}
                testID="unit-alert-note-input"
                accessibilityLabel={noteLabel}
              />
            </Textarea>
            {noteMissing ? (
              <Text className="text-xs text-warning-700" testID="unit-alert-note-required-hint">
                {t('unitAlerts.noteRequiredHint')}
              </Text>
            ) : null}
          </VStack>

          <VStack space="xs">
            <Text className="text-sm text-typography-700">{t('unitAlerts.muteFor')}</Text>
            <HStack space="sm" className="flex-wrap">
              {MUTE_OPTIONS.map((minutes) => (
                <Button
                  key={minutes}
                  size="xs"
                  variant={muteMinutes === minutes ? 'solid' : 'outline'}
                  onPress={() => setMuteMinutes(minutes)}
                  testID={`unit-alert-mute-option-${minutes}`}
                  accessibilityState={{ selected: muteMinutes === minutes }}
                >
                  <ButtonText>{minutes === 0 ? t('unitAlerts.muteUntilStatusChange') : t('unitAlerts.muteMinutes', { count: minutes })}</ButtonText>
                </Button>
              ))}
            </HStack>
          </VStack>

          <HStack space="md" className="pt-2">
            <Button variant="outline" className="flex-1" onPress={onClose} isDisabled={isSubmitting} testID="unit-alert-cancel-button">
              <ButtonText>{t('common.cancel')}</ButtonText>
            </Button>
            <Button variant="outline" className="flex-1" onPress={() => void submit(UnitStatusAlertAcknowledgementMode.Muted)} isDisabled={isSubmitting || noteMissing} testID="unit-alert-mute-button">
              <ButtonText>{t('unitAlerts.mute')}</ButtonText>
            </Button>
            <Button className="flex-1" onPress={() => void submit(UnitStatusAlertAcknowledgementMode.Acknowledged)} isDisabled={isSubmitting || noteMissing} testID="unit-alert-acknowledge-button">
              <ButtonText>{t('unitAlerts.acknowledge')}</ButtonText>
            </Button>
          </HStack>
        </VStack>
      ) : null}
    </CustomBottomSheet>
  );
};
