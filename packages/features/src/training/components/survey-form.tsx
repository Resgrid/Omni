import { OptionChips } from '@resgrid/features/calls/components/option-chips';
import { useTranslation } from '@resgrid/i18n';
import type { LmsSurveyQuestionData } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, Pressable, Text, Textarea, TextareaInput, useThemeColors, View, VStack } from '@resgrid/ui';
import { Circle, CircleDot } from 'lucide-react-native';
import React, { useState } from 'react';

import { isSurveyComplete } from '../lib/training-format';

export interface SurveyFormProps {
  questions: readonly LmsSurveyQuestionData[];
  onSubmit: (answers: Record<string, string>) => void;
  isSubmitting: boolean;
  testID?: string;
}

const RATINGS = ['1', '2', '3', '4', '5'] as const;

/**
 * A survey lesson (course evaluation): Rating questions take 1–5, Choice questions one option (sent as its 0-based index), Text
 * questions an optional comment. Core keeps the answers without the member's id.
 */
export const SurveyForm: React.FC<SurveyFormProps> = ({ questions, onSubmit, isSubmitting, testID = 'survey-form' }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const set = (key: string, value: string) => setAnswers((current) => ({ ...current, [key]: value }));

  return (
    <VStack space="lg" testID={testID}>
      {questions.map((question, index) => (
        <VStack key={question.Key} space="sm" testID={`${testID}-question-${question.Key}`}>
          <Text className="font-semibold text-typography-900">{`${index + 1}. ${question.Text ?? ''}`}</Text>
          {question.Kind === 'Rating' ? (
            <OptionChips
              options={RATINGS.map((value) => ({ value, label: value }))}
              selected={answers[question.Key] ? [answers[question.Key] ?? ''] : []}
              onToggle={(value) => set(question.Key, value)}
              accessibilityLabel={t('training.survey.rating', { text: question.Text ?? '' })}
              testID={`${testID}-rating-${question.Key}`}
            />
          ) : question.Kind === 'Choice' ? (
            (question.Options ?? []).map((option, optionIndex) => {
              const value = String(optionIndex);
              const selected = answers[question.Key] === value;

              return (
                <Pressable
                  key={value}
                  onPress={() => set(question.Key, value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option}
                  testID={`${testID}-choice-${question.Key}-${value}`}
                  className={`flex-row items-center rounded-lg border p-3 ${selected ? 'border-primary-500 bg-primary-50' : 'border-outline-200 bg-background-0'}`}
                >
                  <View>{selected ? <CircleDot size={18} color={colors.primary} /> : <Circle size={18} color={colors.icon} />}</View>
                  <Text className="ml-2 flex-1 text-typography-900">{option}</Text>
                </Pressable>
              );
            })
          ) : (
            <Textarea>
              <TextareaInput
                value={answers[question.Key] ?? ''}
                onChangeText={(text: string) => set(question.Key, text)}
                placeholder={t('training.survey.optional_comment')}
                accessibilityLabel={question.Text ?? ''}
                testID={`${testID}-text-${question.Key}`}
              />
            </Textarea>
          )}
        </VStack>
      ))}
      <Button onPress={() => onSubmit(answers)} isDisabled={!isSurveyComplete(questions, answers) || isSubmitting} testID={`${testID}-submit`}>
        {isSubmitting ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{t('training.survey.submit')}</ButtonText>}
      </Button>
    </VStack>
  );
};
