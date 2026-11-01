import { useAuthStore } from '@resgrid/auth';
import { toDataError, useChecklistsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { ChecklistAnswer, ChecklistInput, ChecklistItem, ChecklistRun } from '@resgrid/models';
import { Button, ButtonText, DateTimeField, Image, Input, InputField, NativeModal, Pressable, Text, Textarea, TextareaInput, useFormFactor } from '@resgrid/ui';
import { X } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  answerChoices,
  applyAnswer,
  ChecklistAnswerStatus,
  checklistErrorKey,
  checklistFailed,
  ChecklistItemType,
  ChecklistRunState,
  isChecklistRequired,
  missingAnswers,
  visibleChecklistItems,
} from '../lib/checklist-form';
import { fetchChecklistEvidence } from '../lib/checklists-api';
import { useChecklistRunWriter } from '../runtime';

export interface ChecklistRunSheetProps {
  run: ChecklistRun | null;
  onClose: () => void;
  /** The run as the server now holds it (after save, submit or attest). */
  onSaved?: (run: ChecklistRun | null) => void;
}

const TEXT_TYPES: ReadonlySet<number> = new Set([ChecklistItemType.Number, ChecklistItemType.Quantity, ChecklistItemType.Text]);

/**
 * One checklist run, item by item (Responder run sheet; R/U identical). Answers live in memory only — runs can carry
 * protected answers — and hidden answers of a conditional form are dropped as the person answers. Saving goes through
 * the registered run writer (see `registerChecklistRunWriter`); a run awaiting a witness can be attested by a
 * different member. Photo and signature evidence can be viewed; capturing it needs the evidence upload in the data layer.
 */
export const ChecklistRunSheet: React.FC<ChecklistRunSheetProps> = ({ run, onClose, onSaved }) => (
  <NativeModal visible={run !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} testID="checklist-run-sheet">
    {run ? <RunBody key={`${run.Id}:${run.Revision}:${run.State}`} run={run} onClose={onClose} onSaved={onSaved} /> : null}
  </NativeModal>
);

function RunBody({ run, onClose, onSaved }: { run: ChecklistRun; onClose: () => void; onSaved?: (run: ChecklistRun | null) => void }) {
  const { t } = useTranslation();
  const { isPhone } = useFormFactor();
  const writer = useChecklistRunWriter();
  const attestRun = useChecklistsStore((state) => state.attestRun);
  const userId = useAuthStore((state) => state.userId);
  const [input, setInput] = useState<ChecklistInput>(() => ({ ...run.Input, Answers: [...run.Input.Answers] }));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attestation, setAttestation] = useState('');
  const [evidence, setEvidence] = useState<Record<string, string>>({});

  const items = useMemo(() => visibleChecklistItems(run.Form, input.Answers), [run.Form, input.Answers]);
  const index = Math.min(step, Math.max(0, items.length - 1));
  const item: ChecklistItem | undefined = items[index];
  const answer = item ? input.Answers.find((candidate) => candidate.ItemId === item.Id) : undefined;
  const editable = run.CanEdit && run.State === ChecklistRunState.InProgress;
  const canWitness = run.State === ChecklistRunState.AwaitingWitness && !!userId && run.CreatedBy !== userId && !!run.SubmissionHash;

  const change = useCallback(
    (patch: Partial<ChecklistAnswer>) => {
      if (!item || !editable) return;
      setInput((current) => ({ ...current, Answers: applyAnswer(run.Form, current.Answers, item.Id, patch) }));
    },
    [item, editable, run.Form]
  );

  const act = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setErrorKey(null);
    setNotice(null);
    try {
      await work();
    } catch (error) {
      setErrorKey(checklistErrorKey(toDataError(error)) ?? 'retry');
    } finally {
      setBusy(false);
    }
  }, []);

  const save = (submit: boolean) =>
    act(async () => {
      if (!writer) return;
      if (submit) {
        const missing = missingAnswers(run.Form, input);
        if (missing.length > 0) {
          setErrorKey('validation');
          setStep(
            Math.max(
              0,
              items.findIndex((candidate) => candidate.Id === missing[0].Id)
            )
          );
          return;
        }
      }
      const result = await writer.save({ run, input: submit ? { ...input, ClientCompletedOn: input.ClientCompletedOn ?? new Date().toISOString() } : input, submit });
      if (result.outcome === 'rejected') {
        setErrorKey('validation');
        return;
      }
      setNotice(result.outcome === 'queued' ? t('checklists.ui.queued') : t('checklists.saved'));
      onSaved?.(result.run ?? null);
    });

  const attest = () =>
    act(async () => {
      const updated = await attestRun({ Id: run.Id, SubmissionHash: run.SubmissionHash ?? null, Attestation: attestation.trim() });
      if (!updated) {
        setErrorKey(checklistErrorKey(useChecklistsStore.getState().actionError) ?? 'retry');
        return;
      }
      setAttestation('');
      onSaved?.(updated);
    });

  const viewEvidence = (fileId: string) =>
    act(async () => {
      const uri = await fetchChecklistEvidence(fileId);
      setEvidence((current) => ({ ...current, [fileId]: uri }));
    });

  const choices = item ? answerChoices(item) : [];
  const files = item ? run.Files.filter((file) => file.ItemId === item.Id) : [];
  const needsCapture = item ? item.Type === ChecklistItemType.Photo || item.Type === ChecklistItemType.Signature || (item.RequirePhotoOnFail && checklistFailed(item, answer)) : false;

  return (
    <View style={styles.screen} className="bg-background-0">
      <View style={styles.header} className="border-outline-100">
        <Text className="flex-1 text-lg font-bold text-typography-900" accessibilityRole="header">
          {run.Form.Name}
        </Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('checklists.ui.close')} className="p-2" testID="checklist-run-close">
          <X size={22} color="#6B7280" />
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={isPhone ? styles.full : styles.framed}>
          <Text className="text-typography-600">{`${run.Target.Name} · ${t('checklists.labels.Version')} ${run.VersionNumber}`}</Text>
          {run.Form.Instructions ? <Text className="mt-1 text-typography-700">{run.Form.Instructions}</Text> : null}
          {editable ? (
            <Text size="sm" className="mt-1 text-typography-500">
              {t('checklists.labels.RunGuidance')}
            </Text>
          ) : null}
          {errorKey ? (
            <Text accessibilityRole="alert" className="mt-2 text-error-600" testID="checklist-run-error">
              {t(`checklists.errors.${errorKey}`)}
            </Text>
          ) : null}
          {notice ? (
            <Text className="mt-2 text-typography-700" accessibilityLiveRegion="polite" testID="checklist-run-notice">
              {notice}
            </Text>
          ) : null}

          {item ? (
            <View className="mt-3 rounded-lg border border-outline-200 p-3" testID={`checklist-item-${item.Id}`}>
              <Text size="sm" className="text-typography-500">{`${index + 1} / ${items.length}`}</Text>
              <Text className="font-bold text-typography-900">{isChecklistRequired(item, input.Answers) ? `${item.Name} (${t('checklists.labels.Required')})` : item.Name}</Text>
              {item.Critical ? <Text className="text-error-600">{t('checklists.labels.Critical')}</Text> : null}
              {item.Instructions ? <Text className="text-typography-700">{item.Instructions}</Text> : null}

              {choices.length > 0 ? (
                <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={item.Name}>
                  {choices.map((choice) => {
                    const selected = answer?.Status === ChecklistAnswerStatus.Answered && answer.Value === choice.value;
                    return (
                      <Button
                        key={choice.value}
                        size="sm"
                        className="mb-2 mr-2"
                        variant={selected ? 'solid' : 'outline'}
                        isDisabled={!editable || busy}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => change({ Status: ChecklistAnswerStatus.Answered, Value: choice.value })}
                        testID={`checklist-choice-${choice.value}`}
                      >
                        <ButtonText>{choice.labelKey ? t(choice.labelKey) : (choice.literal ?? choice.value)}</ButtonText>
                      </Button>
                    );
                  })}
                </View>
              ) : null}
              {item.Type === ChecklistItemType.Date ? (
                <DateTimeField
                  value={answer?.Value ?? ''}
                  onChange={(value: string) => change({ Status: value ? ChecklistAnswerStatus.Answered : ChecklistAnswerStatus.Unanswered, Value: value })}
                  label={item.Name}
                  disabled={!editable || busy}
                  testID="checklist-answer-date"
                />
              ) : null}
              {TEXT_TYPES.has(item.Type) ? (
                <Input isDisabled={!editable || busy} className="mt-2">
                  <InputField
                    value={answer?.Value ?? ''}
                    keyboardType={item.Type === ChecklistItemType.Text ? 'default' : 'decimal-pad'}
                    placeholder={item.Units ?? ''}
                    onChangeText={(value: string) => change({ Status: value ? ChecklistAnswerStatus.Answered : ChecklistAnswerStatus.Unanswered, Value: value })}
                    accessibilityLabel={t('checklists.labels.Answer')}
                    testID="checklist-answer-text"
                  />
                </Input>
              ) : null}

              {item.Type === ChecklistItemType.Photo || item.Type === ChecklistItemType.Signature || item.RequirePhotoOnFail ? (
                <Text size="sm" className="mt-2 text-typography-600">{`${t('checklists.labels.Evidence')}: ${files.length}`}</Text>
              ) : null}
              {needsCapture && editable ? (
                <Text size="xs" className="text-typography-500" testID="checklist-capture-unavailable">
                  {t('checklists.capture_unavailable')}
                </Text>
              ) : null}
              {files.map((file) => (
                <View key={file.Id} className="mt-2">
                  <Button variant="outline" size="sm" isDisabled={busy} onPress={() => void viewEvidence(file.Id)} testID={`checklist-evidence-${file.Id}`}>
                    <ButtonText>{`${t('checklists.labels.Evidence')}: ${file.Name}`}</ButtonText>
                  </Button>
                  {evidence[file.Id] ? (
                    <Image source={{ uri: evidence[file.Id] }} accessibilityLabel={t('checklists.labels.Evidence')} style={styles.evidence} contentFit="contain" testID={`checklist-evidence-image-${file.Id}`} />
                  ) : null}
                </View>
              ))}

              <Text size="sm" className="mt-3 text-typography-700">
                {t('checklists.labels.Note')}
              </Text>
              <Textarea isDisabled={!editable || busy}>
                <TextareaInput value={answer?.Note ?? ''} onChangeText={(Note: string) => change({ Note })} accessibilityLabel={t('checklists.labels.Note')} testID="checklist-answer-note" />
              </Textarea>
              {item.AllowNotApplicable ? (
                <View className="mt-2">
                  <Button
                    size="sm"
                    variant={answer?.Status === ChecklistAnswerStatus.NotApplicable ? 'solid' : 'outline'}
                    isDisabled={!editable || busy}
                    onPress={() => change({ Status: answer?.Status === ChecklistAnswerStatus.NotApplicable ? ChecklistAnswerStatus.Unanswered : ChecklistAnswerStatus.NotApplicable, Value: null })}
                    testID="checklist-answer-na"
                  >
                    <ButtonText>{t('checklists.ui.notApplicable')}</ButtonText>
                  </Button>
                  {answer?.Status === ChecklistAnswerStatus.NotApplicable ? (
                    <Input isDisabled={!editable} className="mt-2">
                      <InputField
                        value={answer.NotApplicableReason ?? ''}
                        onChangeText={(NotApplicableReason: string) => change({ NotApplicableReason })}
                        accessibilityLabel={t('checklists.ui.reason')}
                        placeholder={t('checklists.ui.reason')}
                        testID="checklist-answer-na-reason"
                      />
                    </Input>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.stepper}>
                <Button variant="outline" size="sm" isDisabled={index === 0} onPress={() => setStep(index - 1)} testID="checklist-previous">
                  <ButtonText>{t('checklists.labels.Previous')}</ButtonText>
                </Button>
                <Button variant="outline" size="sm" isDisabled={index >= items.length - 1} onPress={() => setStep(index + 1)} testID="checklist-next">
                  <ButtonText>{t('checklists.labels.Next')}</ButtonText>
                </Button>
              </View>
            </View>
          ) : null}

          <Text size="sm" className="mt-3 text-typography-700">
            {t('checklists.labels.Note')}
          </Text>
          <Textarea isDisabled={!editable || busy}>
            <TextareaInput value={input.Note ?? ''} onChangeText={(Note: string) => setInput((current) => ({ ...current, Note }))} accessibilityLabel={t('checklists.labels.Note')} testID="checklist-run-note" />
          </Textarea>
          <Input isDisabled={!editable || busy} className="mt-2">
            <InputField
              value={input.LocationDescription ?? ''}
              onChangeText={(LocationDescription: string) => setInput((current) => ({ ...current, LocationDescription }))}
              placeholder={t('checklists.labels.ReportedLocation')}
              accessibilityLabel={t('checklists.labels.ReportedLocation')}
              testID="checklist-run-location"
            />
          </Input>

          {editable ? (
            <View className="mt-3">
              {writer ? null : (
                <Text size="sm" className="mb-2 text-typography-500" testID="checklist-save-unavailable">
                  {t('checklists.save_unavailable')}
                </Text>
              )}
              <Button isDisabled={busy || !writer} onPress={() => void save(false)} testID="checklist-save-progress">
                <ButtonText>{t('checklists.labels.SaveProgress')}</ButtonText>
              </Button>
              <Button className="mt-2" action="positive" isDisabled={busy || !writer} onPress={() => void save(true)} testID="checklist-submit">
                <ButtonText>{t('checklists.labels.SubmitRun')}</ButtonText>
              </Button>
            </View>
          ) : null}

          {canWitness ? (
            <View className="mt-3" testID="checklist-witness">
              <Text className="text-typography-700">{t('checklists.labels.WitnessInstructions')}</Text>
              <Input className="mt-2">
                <InputField value={attestation} onChangeText={setAttestation} accessibilityLabel={t('checklists.labels.Attestation')} placeholder={t('checklists.labels.Attestation')} testID="checklist-attestation" />
              </Input>
              <Button className="mt-2" isDisabled={busy || !attestation.trim()} onPress={() => void attest()} testID="checklist-attest">
                <ButtonText>{t('checklists.labels.Attest')}</ButtonText>
              </Button>
            </View>
          ) : null}

          {run.State > ChecklistRunState.InProgress ? (
            <Text className="mt-3 text-typography-700" testID="checklist-run-state">
              {`${t(run.State === ChecklistRunState.AwaitingWitness ? 'checklists.labels.AwaitingWitness' : 'checklists.labels.Submitted')} · ${t('checklists.labels.Score')}: ${run.Score ?? '—'}`}
            </Text>
          ) : null}
          <Button variant="outline" className="mt-3" onPress={onClose} testID="checklist-run-dismiss">
            <ButtonText>{t('checklists.ui.close')}</ButtonText>
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, borderBottomWidth: 1 },
  content: { padding: 16, paddingBottom: 48 },
  full: { width: '100%' },
  framed: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  stepper: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  evidence: { width: 240, height: 180 },
});
