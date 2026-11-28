import { useTrainingStore } from '@resgrid/data';
import { FormField } from '@resgrid/features/certifications/components/form-field';
import { SectionCard } from '@resgrid/features/certifications/components/section-card';
import { hoursOf } from '@resgrid/features/certifications/lib/certification-format';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, Input, InputField, KeyboardAwareScrollView, Loading, ScreenHeader, showToast, Text, Textarea, TextareaInput, useThemeColors, View, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { FileQuestion } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { EvidencePicker } from '../components/evidence-picker';
import { type EvidenceFile, evidenceProblem, MAX_EVIDENCE_FILES, toEvidenceInputs } from '../lib/evidence';
import { submissionErrorKey } from '../lib/submission';
import { parseTrainingRouteId, trainingRoutes } from '../routes';

/** Why the reply cannot be sent (a translation key), or null: it needs a note or a file, valid hours and acceptable files. */
export function respondProblem(note: string, hours: string, files: readonly Pick<EvidenceFile, 'bytes'>[]): string | null {
  if (!note.trim() && files.length === 0) return 'training.respond.note_or_file';

  if (hours.trim() !== '' && hoursOf(hours) === null) return 'training.submit.hours_invalid';

  return evidenceProblem(files);
}

/**
 * Answering a reviewer (`/training/submission/[id]`): a CE/CPD submission the department's reviewer sent back asking for more
 * information. The member reads the reviewer's note, answers it, can correct the hours and adds evidence (photos converted on the
 * device to JPEG without location data); the submission goes back to the reviewers. Online only.
 */
export default function RespondSubmissionScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const recordId = parseTrainingRouteId(params.id);
  const record = useTrainingStore((state) => (recordId ? state.transcript.find((item) => item.Id === recordId) : undefined));
  const [note, setNote] = useState('');
  const [hours, setHours] = useState('');
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // The transcript as read on opening (a reviewer's request opened from a notification is newer than the copy kept offline).
  const [isChecked, setIsChecked] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace(trainingRoutes.home()));
  const reload = useCallback(() => useTrainingStore.getState().fetchTranscript({ bypassCache: true }), []);

  useEffect(() => {
    let current = true;

    void reload().finally(() => {
      if (current) setIsChecked(true);
    });

    return () => {
      current = false;
    };
  }, [reload]);

  if (!record && recordId && !isChecked) {
    return (
      <View className="flex-1 bg-background-50" testID="respond-submission-screen">
        <ScreenHeader title={t('training.respond.title')} onBack={back} />
        <Loading />
      </View>
    );
  }

  if (!record || !recordId) {
    return (
      <View className="flex-1 bg-background-50" testID="respond-submission-screen">
        <ScreenHeader title={t('training.respond.title')} onBack={back} />
        <ZeroState icon={FileQuestion} heading={t('training.respond.not_found')} onRetry={reload} testID="respond-submission-missing" />
      </View>
    );
  }

  const send = async () => {
    const found = respondProblem(note, hours, files);
    setProblem(found);

    if (found) return;

    setIsSending(true);

    try {
      const outcome = await useTrainingStore.getState().respondToSubmission({
        Id: recordId,
        Note: note.trim() || null,
        Hours: hours.trim() ? hoursOf(hours) : null,
        Files: toEvidenceInputs(files),
      });

      if (outcome.value) {
        showToast('success', t('training.respond.sent'));
        back();
      } else showToast('error', t(submissionErrorKey(outcome.error)));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View className="flex-1 bg-background-50" testID="respond-submission-screen">
      <ScreenHeader title={t('training.respond.title')} onBack={back} />
      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="respond-submission-form">
        <SectionCard title={record.Title ?? ''} description={t('training.respond.reviewer_asked')}>
          <Text className="text-typography-800" testID="respond-submission-review-note">
            {record.ReviewNote || t('training.respond.no_note')}
          </Text>
        </SectionCard>
        <SectionCard title={t('training.respond.your_answer')}>
          <FormField label={t('training.respond.note')} testID="respond-submission-note">
            <Textarea>
              <TextareaInput value={note} onChangeText={setNote} accessibilityLabel={t('training.respond.note')} testID="respond-submission-note-input" />
            </Textarea>
          </FormField>
          <FormField label={t('training.respond.hours')} optional hint={t('training.respond.hours_hint', { hours: record.Hours })} last testID="respond-submission-hours">
            <Input>
              <InputField value={hours} onChangeText={setHours} keyboardType="decimal-pad" accessibilityLabel={t('training.respond.hours')} testID="respond-submission-hours-input" />
            </Input>
          </FormField>
        </SectionCard>
        <SectionCard title={t('training.submit.evidence')} description={t('training.submit.evidence_description')}>
          <EvidencePicker files={files} onChange={setFiles} max={MAX_EVIDENCE_FILES} testID="respond-submission" />
        </SectionCard>
        {problem ? (
          <Text size="sm" className="mb-3 text-error-600" accessibilityRole="alert" testID="respond-submission-problem">
            {t(problem)}
          </Text>
        ) : null}
        <Button size="lg" onPress={() => void send()} isDisabled={isSending} testID="respond-submission-send">
          {isSending ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{t('training.respond.send')}</ButtonText>}
        </Button>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
});
