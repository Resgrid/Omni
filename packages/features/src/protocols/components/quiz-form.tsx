import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, HStack, Pressable, Text, Textarea, TextareaInput, useThemeColors, VStack } from '@resgrid/ui';
import { CheckSquare, Circle, CircleDot, Square } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

/** One question as the quiz shows it: Core sends questions and option keys, never which one is right. */
export interface QuizQuestionView {
  id: string;
  text: string;
  /** Several answers may be picked. */
  multiple: boolean;
  /** A written answer (LMS short answer, graded by an instructor). */
  freeText?: boolean;
  options: readonly { key: string; text: string }[];
}

export interface QuizSubmission {
  /** Picked option keys by question id. */
  keys: Record<string, string[]>;
  /** Written answers by question id. */
  texts: Record<string, string>;
}

export interface QuizFormProps {
  questions: readonly QuizQuestionView[];
  onSubmit: (submission: QuizSubmission) => void;
  isSubmitting?: boolean;
  testID?: string;
}

/** True once every question has an answer (a written one is not blank). */
export function isQuizComplete(questions: readonly QuizQuestionView[], submission: QuizSubmission): boolean {
  return questions.every((question) => (question.freeText ? (submission.texts[question.id] ?? '').trim().length > 0 : (submission.keys[question.id] ?? []).length > 0));
}

/** The next picked keys for a question after tapping an option (one for single choice, a toggle for several). */
export function toggleQuizKey(current: readonly string[], key: string, multiple: boolean): string[] {
  if (!multiple) return [key];

  return current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
}

/**
 * A quiz the server scores (protocol acknowledgment quiz, baseline training quiz, LMS assessment): every question with its
 * options as radio or check rows, written answers where asked, and Submit once all are answered. It never knows the key.
 */
export const QuizForm: React.FC<QuizFormProps> = ({ questions, onSubmit, isSubmitting = false, testID = 'quiz-form' }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [submission, setSubmission] = useState<QuizSubmission>({ keys: {}, texts: {} });
  const complete = useMemo(() => isQuizComplete(questions, submission), [questions, submission]);

  const pick = (question: QuizQuestionView, key: string) => setSubmission((current) => ({ ...current, keys: { ...current.keys, [question.id]: toggleQuizKey(current.keys[question.id] ?? [], key, question.multiple) } }));

  return (
    <VStack space="lg" testID={testID}>
      {questions.map((question, index) => (
        <VStack
          key={question.id}
          space="sm"
          accessibilityRole={question.multiple ? undefined : 'radiogroup'}
          accessibilityLabel={question.multiple ? undefined : question.text}
          testID={`${testID}-question-${question.id}`}
        >
          <Text className="font-semibold text-typography-900">{`${index + 1}. ${question.text}`}</Text>
          {question.multiple ? (
            <Text size="xs" className="text-typography-500">
              {t('protocols.quiz.pick_all')}
            </Text>
          ) : null}
          {question.freeText ? (
            <Textarea>
              <TextareaInput
                value={submission.texts[question.id] ?? ''}
                onChangeText={(text: string) => setSubmission((current) => ({ ...current, texts: { ...current.texts, [question.id]: text } }))}
                placeholder={t('protocols.quiz.your_answer')}
                accessibilityLabel={question.text}
                testID={`${testID}-text-${question.id}`}
              />
            </Textarea>
          ) : (
            question.options.map((option) => {
              const selected = (submission.keys[question.id] ?? []).includes(option.key);
              const Icon = question.multiple ? (selected ? CheckSquare : Square) : selected ? CircleDot : Circle;

              return (
                <Pressable
                  key={option.key}
                  onPress={() => pick(question, option.key)}
                  accessibilityRole={question.multiple ? 'checkbox' : 'radio'}
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={option.text}
                  testID={`${testID}-option-${question.id}-${option.key}`}
                  className={`rounded-lg border p-3 ${selected ? 'border-primary-500 bg-primary-50' : 'border-outline-200 bg-background-0'}`}
                >
                  <HStack space="md" className="items-center">
                    <View>
                      <Icon size={20} color={selected ? colors.primary : colors.icon} />
                    </View>
                    <Text className="flex-1 text-typography-900">{option.text}</Text>
                  </HStack>
                </Pressable>
              );
            })
          )}
        </VStack>
      ))}
      <Button onPress={() => onSubmit(submission)} isDisabled={!complete || isSubmitting} testID={`${testID}-submit`}>
        {isSubmitting ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{t('protocols.quiz.submit')}</ButtonText>}
      </Button>
    </VStack>
  );
};
