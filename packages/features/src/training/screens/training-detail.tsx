import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { downloadTrainingAttachment, useTrainingStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { trainingQuizQuestions } from '@resgrid/features/protocols/components/acknowledgment-panel';
import { FileList } from '@resgrid/features/protocols/components/file-list';
import { QuizForm, type QuizSubmission } from '@resgrid/features/protocols/components/quiz-form';
import { useTranslation } from '@resgrid/i18n';
import type { TrainingQuizSubmissionData } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HtmlRenderer, Loading, ScreenHeader, ScrollView, showToast, Text, useThemeColors, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { GraduationCap } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { assignmentStateKey } from '../lib/training-format';
import { parseTrainingRouteId, trainingRoutes } from '../routes';

export interface TrainingDetailScreenProps {
  trainingId?: number;
}

const Card: React.FC<{ title?: string; children: React.ReactNode; testID?: string }> = ({ title, children, testID }) => (
  <View className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-4" testID={testID}>
    {title ? (
      <Text className="mb-2 font-semibold text-typography-900" accessibilityRole="header">
        {title}
      </Text>
    ) : null}
    {children}
  </View>
);

/**
 * A baseline training (`/training/[id]`, free): its content and attachments, the member's assignment state and due date, and
 * what the member does with it — enrol (an open training), confirm they read it (no quiz) or take the quiz (scored on the
 * server; the result and the attempts left come back, never the key). Opening it marks the assignment viewed on the server.
 */
export default function TrainingDetailScreen({ trainingId: trainingIdProp }: TrainingDetailScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const timeZone = useDepartmentTimeZone();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const trainingId = trainingIdProp ?? parseTrainingRouteId(params.id);
  const training = useTrainingStore((state) => (trainingId ? state.trainingsById[trainingId] : undefined));
  const isLoading = useTrainingStore((state) => state.loading.detail === true);
  const [isBusy, setIsBusy] = useState(false);
  const [result, setResult] = useState<TrainingQuizSubmissionData | null>(null);

  const reload = useCallback(async () => {
    if (trainingId) await useTrainingStore.getState().fetchTraining(trainingId, { bypassCache: true });
  }, [trainingId]);

  useEffect(() => {
    // Always read it again online: opening a training is what marks it viewed.
    void reload();
  }, [reload]);

  const back = () => (router.canGoBack() ? router.back() : router.replace(trainingRoutes.home()));

  if (!training) {
    return (
      <View className="flex-1 bg-background-50" testID="training-detail-screen">
        <ScreenHeader title={t('training.title')} onBack={back} />
        {isLoading && trainingId ? <Loading /> : <ZeroState icon={GraduationCap} heading={t('training.not_found')} onRetry={trainingId ? reload : undefined} testID="training-detail-missing" />}
      </View>
    );
  }

  const assignment = training.Assignment;
  const isOpen = !!assignment && !assignment.Complete && !assignment.Exempt;
  const quizQuestions = trainingQuizQuestions(training.Quiz);
  const canTakeQuiz = isOpen && quizQuestions.length > 0 && (assignment?.AttemptsLeft ?? 1) > 0;
  const canConfirm = isOpen && training.RequiresAcknowledgment && !training.HasQuiz;
  const due = assignment?.DueOn ? formatUtcInDepartmentTime(assignment.DueOn, timeZone, { dateStyle: 'medium' }) : '';
  const attachments = (training.Attachments ?? []).map((attachment) => ({ id: String(attachment.TrainingAttachmentId), name: attachment.FileName ?? '', type: attachment.FileType, size: attachment.FileSize }));

  const run = async (work: () => Promise<boolean>, successKey: string) => {
    setIsBusy(true);

    try {
      const done = await work();
      showToast(done ? 'success' : 'error', t(done ? successKey : 'training.errors.generic'));
    } finally {
      setIsBusy(false);
    }
  };

  const submitQuiz = async (submission: QuizSubmission) => {
    setIsBusy(true);

    try {
      const answers = Object.entries(submission.keys).map(([questionId, keys]) => ({ QuestionId: Number(questionId), OptionIds: keys.map(Number) }));
      const outcome = await useTrainingStore.getState().submitQuiz(training.TrainingId, answers);

      if (outcome.value) setResult(outcome.value);
      else showToast('error', t(outcome.error === 'AttemptLimitReached' ? 'training.errors.attempt_limit' : 'training.errors.generic'));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-background-50" testID="training-detail-screen">
      <ScreenHeader title={training.Name ?? t('training.title')} onBack={back} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card testID="training-detail-summary">
          <Text size="sm" className="text-typography-600">
            {[
              assignment ? t(assignmentStateKey(assignment)) : t('training.not_assigned'),
              due ? t('training.due_on', { date: due }) : null,
              training.Hours ? t('training.hours', { count: training.Hours }) : null,
              training.CeHours ? t('training.ce_hours', { count: training.CeHours }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {training.CeProvider || training.CeCourseNumber ? (
            <Text size="xs" className="mt-1 text-typography-500">
              {[training.CeProvider, training.CeCourseNumber].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {training.Description ? (
            <View style={styles.html}>
              <HtmlRenderer html={training.Description} rendererKey={`training-${training.TrainingId}-description`} autoHeight testID="training-detail-description" />
            </View>
          ) : null}
        </Card>
        {training.TrainingText ? (
          <Card testID="training-detail-content">
            <HtmlRenderer html={training.TrainingText} rendererKey={`training-${training.TrainingId}-text`} autoHeight testID="training-detail-text" />
          </Card>
        ) : null}
        {attachments.length > 0 ? (
          <Card title={t('protocols.files.title')} testID="training-detail-files">
            <FileList files={attachments} download={(id) => downloadTrainingAttachment(Number(id))} testID="training-files" />
          </Card>
        ) : null}
        {!assignment && training.AllowSelfEnroll ? (
          <Button onPress={() => void run(() => useTrainingStore.getState().selfEnroll(training.TrainingId), 'training.enrolled')} isDisabled={isBusy} testID="training-detail-enroll">
            {isBusy ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{t('training.enroll')}</ButtonText>}
          </Button>
        ) : null}
        {canConfirm ? (
          <Button onPress={() => void run(() => useTrainingStore.getState().acknowledgeTraining(training.TrainingId), 'training.confirmed')} isDisabled={isBusy} testID="training-detail-confirm">
            {isBusy ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{t('training.confirm_read')}</ButtonText>}
          </Button>
        ) : null}
        {result ? (
          <Card testID="training-quiz-result">
            <VStack space="xs">
              <Text className={result.Passed ? 'font-semibold text-success-700' : 'font-semibold text-error-600'}>
                {t(result.Passed ? 'protocols.quiz.passed' : 'protocols.quiz.failed', { percent: Math.round(result.Score) })}
              </Text>
              <Text size="sm" className="text-typography-600">
                {t('training.quiz_correct', { correct: result.CorrectCount, total: result.QuestionCount })}
              </Text>
              {result.AttemptsLeft !== null && !result.Passed ? (
                <Text size="sm" className="text-typography-600">
                  {t('training.attempts_left', { count: result.AttemptsLeft })}
                </Text>
              ) : null}
            </VStack>
          </Card>
        ) : null}
        {canTakeQuiz && !result?.Passed ? (
          <Card title={t('training.quiz')} testID="training-quiz">
            {training.Quiz ? (
              <Text size="xs" className="mb-3 text-typography-500">
                {t('training.pass_mark', { percent: Math.round(training.Quiz.MinimumScore) })}
              </Text>
            ) : null}
            <QuizForm key={result ? `retry-${result.AttemptNumber}` : 'first'} questions={quizQuestions} onSubmit={(submission) => void submitQuiz(submission)} isSubmitting={isBusy} testID="training-quiz-form" />
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  html: { marginTop: 8 },
});
