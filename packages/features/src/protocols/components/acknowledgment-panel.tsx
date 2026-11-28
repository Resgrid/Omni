import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { AcknowledgmentStatus, useProtocolAcknowledgmentsStore, useTrainingStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import type { ProtocolAcknowledgmentResultData, ProtocolQuizView, TrainingQuizData } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, Spinner, Text, useThemeColors, useToast, VStack } from '@resgrid/ui';
import { BadgeCheck, ClipboardCheck } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { acknowledgeOutcomeKey, acknowledgmentStatusKey } from '../lib/protocol-library';
import { QuizForm, type QuizQuestionView, type QuizSubmission } from './quiz-form';

export interface AcknowledgmentPanelProps {
  acknowledgment: ProtocolAcknowledgmentResultData;
  /**
   * The content hash of the owed version's loaded content (the source version's, which is what Core checks), or null while
   * that content has not loaded. Signing waits for it: the member signs only the text they were shown.
   */
  contentHash: string | null;
  testID?: string;
}

/** Bank-quiz questions as the quiz form shows them (Core Kind 1 takes several answers). */
export const bankQuizQuestions = (quiz: ProtocolQuizView | null): QuizQuestionView[] =>
  (quiz?.Questions ?? []).map((question) => ({
    id: String(question.QuestionId),
    text: question.Text ?? '',
    multiple: question.Kind === 1,
    options: (question.Options ?? []).map((option) => ({ key: option.Key, text: option.Text ?? '' })),
  }));

/** Baseline training quiz questions (option ids as keys; Core `TrainingQuestionTypes` 1 takes several answers). */
export const trainingQuizQuestions = (quiz: TrainingQuizData | null | undefined): QuizQuestionView[] =>
  (quiz?.Questions ?? []).map((question) => ({
    id: String(question.QuestionId),
    text: question.Text ?? '',
    multiple: question.Type === 1,
    options: (question.Options ?? []).map((option) => ({ key: String(option.OptionId), text: option.Text ?? '' })),
  }));

type QuizState = { kind: 'none' } | { kind: 'loading' } | { kind: 'bank'; quiz: ProtocolQuizView } | { kind: 'training'; trainingId: number; quiz: TrainingQuizData } | { kind: 'unavailable' };

/**
 * Read-and-sign for the version on screen (protocols plan P2): the member confirms they read it, and where the version asks
 * for it passes its quiz (a baseline training quiz, or the LMS question-bank quiz), scored on the server. Signing goes through the
 * outbox (queued offline); when the department asks for a step-up the in-app sheet opens, and a signing not yet verified is held
 * here with a way to verify. Quizzes are online only.
 */
export const AcknowledgmentPanel: React.FC<AcknowledgmentPanelProps> = ({ acknowledgment, contentHash, testID = 'protocol-acknowledgment' }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const colors = useThemeColors();
  const timeZone = useDepartmentTimeZone();
  const [isSigning, setIsSigning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quiz, setQuiz] = useState<QuizState>({ kind: 'none' });
  const [lastScore, setLastScore] = useState<{ passed: boolean; percent: number } | null>(null);
  const awaitingQuiz = acknowledgment.Status === AcknowledgmentStatus.AwaitingQuiz;
  const isHeld = useProtocolAcknowledgmentsStore((state) => state.held.some((item) => item.protocolVersionId === acknowledgment.ProtocolVersionId));
  const trainingQuizId = acknowledgment.QuizTrainingId && !acknowledgment.QuizPassed ? acknowledgment.QuizTrainingId : null;
  // Each quiz load takes a ticket; only the latest one may install its quiz, so a load for an earlier acknowledgment (the
  // panel stays mounted when the owed version changes) or a superseded retry never shows under the current one.
  const quizTicket = useRef(0);

  const loadQuiz = useCallback(async () => {
    quizTicket.current += 1;
    const ticket = quizTicket.current;

    const install = (next: QuizState) => {
      if (ticket === quizTicket.current) setQuiz(next);
    };

    install({ kind: 'loading' });

    if (acknowledgment.BankQuizOwed) {
      const started = await useProtocolAcknowledgmentsStore.getState().startBankQuiz(acknowledgment.ProtocolVersionId);
      install(started.quiz ? { kind: 'bank', quiz: started.quiz } : { kind: 'unavailable' });

      return;
    }

    if (trainingQuizId) {
      const training = await useTrainingStore.getState().fetchTraining(trainingQuizId, { bypassCache: true });
      install(training?.Quiz ? { kind: 'training', trainingId: trainingQuizId, quiz: training.Quiz } : { kind: 'unavailable' });

      return;
    }

    install({ kind: 'unavailable' });
  }, [acknowledgment.BankQuizOwed, acknowledgment.ProtocolVersionId, trainingQuizId]);

  useEffect(() => {
    if (awaitingQuiz) {
      void loadQuiz();

      return;
    }

    // No quiz owed now: a load still in flight must not bring one back.
    quizTicket.current += 1;
    setQuiz({ kind: 'none' });
  }, [awaitingQuiz, loadQuiz]);

  const sign = async () => {
    // Only the hash of the version content on screen: never the acknowledgment's own hash, which would sign text not yet shown.
    if (!contentHash) return;
    setIsSigning(true);

    try {
      const result = await useProtocolAcknowledgmentsStore.getState().acknowledge(acknowledgment.ProtocolVersionId, contentHash);

      if (result.kind === 'answered') {
        const message = t(acknowledgeOutcomeKey(result.data.Outcome));

        if (result.data.Accepted || result.data.Outcome === 'AwaitingQuiz') toast.success(message);
        else toast.error(message);
      } else if (result.kind === 'queued') toast.info(t('protocols.ack.queued'));
      else if (result.kind === 'awaiting_step_up') toast.info(t('protocols.ack.awaiting_step_up'));
      else toast.error(t('protocols.ack.failed'));
    } finally {
      setIsSigning(false);
    }
  };

  const submitQuiz = async (submission: QuizSubmission) => {
    setIsSubmitting(true);

    try {
      if (quiz.kind === 'bank') {
        const answers = Object.entries(submission.keys).map(([questionId, keys]) => ({ QuestionId: Number(questionId), Keys: keys }));
        const outcome = await useProtocolAcknowledgmentsStore.getState().submitBankQuiz(quiz.quiz.AttemptId, answers);

        if (!outcome.result) {
          toast.error(t('protocols.quiz.submit_failed'));

          return;
        }

        setLastScore({ passed: outcome.result.Passed, percent: Math.round(outcome.result.Percent) });

        if (!outcome.result.Passed) void loadQuiz();
      } else if (quiz.kind === 'training') {
        const answers = Object.entries(submission.keys).map(([questionId, keys]) => ({ QuestionId: Number(questionId), OptionIds: keys.map(Number) }));
        const outcome = await useTrainingStore.getState().submitQuiz(quiz.trainingId, answers);

        if (!outcome.value) {
          toast.error(t('protocols.quiz.submit_failed'));

          return;
        }

        setLastScore({ passed: outcome.value.Passed, percent: Math.round(outcome.value.Score) });
        await useProtocolAcknowledgmentsStore.getState().fetchAcknowledgments({ bypassCache: true });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const signedOn = acknowledgment.SignedOn ? formatUtcInDepartmentTime(acknowledgment.SignedOn, timeZone) : '';
  const dueOn = acknowledgment.DueOn ? formatUtcInDepartmentTime(acknowledgment.DueOn, timeZone, { dateStyle: 'medium' }) : '';

  return (
    <View className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-4" testID={testID}>
      <HStack space="sm" className="mb-2 items-center">
        <View>{acknowledgment.Status === AcknowledgmentStatus.Acknowledged ? <BadgeCheck size={18} color={colors.success} /> : <ClipboardCheck size={18} color={colors.icon} />}</View>
        <Text className="flex-1 font-semibold text-typography-900" accessibilityRole="header">
          {t('protocols.ack.title')}
        </Text>
        <Text size="xs" className={acknowledgment.IsOverdue ? 'text-error-600' : 'text-typography-600'} testID={`${testID}-status`}>
          {t(acknowledgmentStatusKey(acknowledgment))}
        </Text>
      </HStack>
      {acknowledgment.Status === AcknowledgmentStatus.Acknowledged ? (
        <Text size="sm" className="text-typography-600">
          {signedOn ? t('protocols.ack.signed_on', { date: signedOn }) : t('protocols.ack.done')}
        </Text>
      ) : (
        <VStack space="md">
          <Text size="sm" className="text-typography-600">
            {dueOn ? t('protocols.ack.due_on', { date: dueOn }) : t('protocols.ack.prompt')}
          </Text>
          {lastScore ? (
            <Text size="sm" className={lastScore.passed ? 'text-success-700' : 'text-error-600'} testID={`${testID}-score`}>
              {t(lastScore.passed ? 'protocols.quiz.passed' : 'protocols.quiz.failed', { percent: lastScore.percent })}
            </Text>
          ) : null}
          {awaitingQuiz ? (
            quiz.kind === 'loading' ? (
              <Spinner />
            ) : quiz.kind === 'bank' ? (
              <QuizForm key={quiz.quiz.AttemptId} questions={bankQuizQuestions(quiz.quiz)} onSubmit={(submission) => void submitQuiz(submission)} isSubmitting={isSubmitting} testID={`${testID}-quiz`} />
            ) : quiz.kind === 'training' ? (
              <QuizForm questions={trainingQuizQuestions(quiz.quiz)} onSubmit={(submission) => void submitQuiz(submission)} isSubmitting={isSubmitting} testID={`${testID}-quiz`} />
            ) : (
              <Text size="sm" className="text-typography-600">
                {acknowledgment.QuizTrainingName ? t('protocols.quiz.unavailable_named', { name: acknowledgment.QuizTrainingName }) : t('protocols.quiz.unavailable')}
              </Text>
            )
          ) : isHeld ? (
            <VStack space="sm" testID={`${testID}-held`}>
              <Text size="sm" className="text-typography-700">
                {t('protocols.ack.awaiting_step_up')}
              </Text>
              <Button onPress={() => void useProtocolAcknowledgmentsStore.getState().verifyHeld(acknowledgment.ProtocolVersionId)} testID={`${testID}-verify`}>
                <ButtonText>{t('protocols.ack.verify_now')}</ButtonText>
              </Button>
            </VStack>
          ) : (
            <VStack space="sm">
              {contentHash ? null : (
                <Text size="sm" className="text-typography-500" testID={`${testID}-content-needed`}>
                  {t('protocols.ack.content_needed')}
                </Text>
              )}
              <Button onPress={() => void sign()} isDisabled={isSigning || !contentHash} testID={`${testID}-sign`}>
                {isSigning ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{t('protocols.ack.sign')}</ButtonText>}
              </Button>
            </VStack>
          )}
        </VStack>
      )}
    </View>
  );
};
