import { useTrainingStore } from '@resgrid/data';
import { OptionSheet } from '@resgrid/features/auth-ui/components/option-sheet';
import { FormField } from '@resgrid/features/certifications/components/form-field';
import { SectionCard } from '@resgrid/features/certifications/components/section-card';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, DateTimeField, Input, InputField, KeyboardAwareScrollView, Pressable, ScreenHeader, showToast, Text, Textarea, TextareaInput, useThemeColors, View } from '@resgrid/ui';
import { router } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { EvidencePicker } from '../components/evidence-picker';
import { type EvidenceFile, MAX_EVIDENCE_FILES } from '../lib/evidence';
import { submissionErrorKey, type SubmissionFormErrors, toSubmissionInput, validateSubmission } from '../lib/submission';
import { TRAINING_METHODS } from '../lib/training-format';
import { trainingRoutes } from '../routes';

type Sheet = 'category' | 'method' | null;

/**
 * Outside training hours (CE/CPD, free; `/training/submit`): what was taken, when, how many hours, the category and CE
 * details, and up to five evidence files. Photos are converted on the device to JPEG without metadata (Core refuses HEIC so
 * that location data never reaches storage). Depending on the department's settings the record waits for a reviewer or is
 * accepted as self-reported. Online only.
 */
export default function SubmitHoursScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const categories = useTrainingStore((state) => state.categories);
  const [title, setTitle] = useState('');
  const [completedOn, setCompletedOn] = useState('');
  const [hours, setHours] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [method, setMethod] = useState<number | null>(null);
  const [ceProvider, setCeProvider] = useState('');
  const [ceCourseNumber, setCeCourseNumber] = useState('');
  const [ceHours, setCeHours] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [errors, setErrors] = useState<SubmissionFormErrors>({});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void useTrainingStore.getState().fetchCategories();
  }, []);

  const back = () => (router.canGoBack() ? router.back() : router.replace(trainingRoutes.home()));
  const categoryOptions = useMemo(() => categories.map((category) => ({ value: String(category.CategoryId), label: category.Name ?? category.Code ?? '' })), [categories]);
  const methodOptions = useMemo(() => TRAINING_METHODS.map((item) => ({ value: String(item.value), label: t(item.labelKey) })), [t]);
  const categoryName = categories.find((category) => category.CategoryId === categoryId)?.Name ?? null;
  const methodLabel = TRAINING_METHODS.find((item) => item.value === method);

  const save = async () => {
    const values = { title, completedOn, hours, categoryId, method, ceProvider, ceCourseNumber, ceHours, notes, files };
    const found = validateSubmission(values);
    setErrors(found);

    if (Object.keys(found).length > 0) return;
    setIsSaving(true);

    try {
      const outcome = await useTrainingStore.getState().submitExternal(toSubmissionInput(values));

      if (outcome.value) {
        showToast('success', t(outcome.value.ReviewRequired ? 'training.submit.sent_for_review' : 'training.submit.recorded'));
        back();
      } else showToast('error', t(submissionErrorKey(outcome.error)));
    } finally {
      setIsSaving(false);
    }
  };

  const message = (key: string | undefined): string | null => (key ? t(key) : null);

  return (
    <View className="flex-1 bg-background-50" testID="submit-hours-screen">
      <ScreenHeader title={t('training.submit.title')} onBack={back} />
      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="submit-hours-form">
        <SectionCard title={t('training.submit.what')} description={t('training.submit.what_description')}>
          <FormField label={t('training.submit.course_title')} error={message(errors.title)} testID="submit-hours-title">
            <Input>
              <InputField value={title} onChangeText={setTitle} accessibilityLabel={t('training.submit.course_title')} testID="submit-hours-title-input" />
            </Input>
          </FormField>
          <FormField error={message(errors.completedOn)} testID="submit-hours-date">
            <DateTimeField label={t('training.submit.completed_on')} value={completedOn} onChange={setCompletedOn} mode="date" testID="submit-hours-date-input" />
          </FormField>
          <FormField label={t('training.submit.hours')} error={message(errors.hours)} testID="submit-hours-hours">
            <Input>
              <InputField value={hours} onChangeText={setHours} keyboardType="decimal-pad" accessibilityLabel={t('training.submit.hours')} testID="submit-hours-hours-input" />
            </Input>
          </FormField>
          {categoryOptions.length > 0 ? (
            <FormField label={t('training.submit.category')} optional testID="submit-hours-category">
              <Pressable onPress={() => setSheet('category')} accessibilityRole="button" className="flex-row items-center rounded-md border border-outline-300 px-3 py-2" testID="submit-hours-category-button">
                <Text className="flex-1 text-typography-900">{categoryName ?? t('training.submit.choose')}</Text>
                <View>
                  <ChevronDown size={16} color={colors.icon} />
                </View>
              </Pressable>
            </FormField>
          ) : null}
          <FormField label={t('training.submit.method')} optional last testID="submit-hours-method">
            <Pressable onPress={() => setSheet('method')} accessibilityRole="button" className="flex-row items-center rounded-md border border-outline-300 px-3 py-2" testID="submit-hours-method-button">
              <Text className="flex-1 text-typography-900">{methodLabel ? t(methodLabel.labelKey) : t('training.submit.choose')}</Text>
              <View>
                <ChevronDown size={16} color={colors.icon} />
              </View>
            </Pressable>
          </FormField>
        </SectionCard>
        <SectionCard title={t('training.submit.ce')} description={t('training.submit.ce_description')}>
          <FormField label={t('training.submit.ce_provider')} optional>
            <Input>
              <InputField value={ceProvider} onChangeText={setCeProvider} accessibilityLabel={t('training.submit.ce_provider')} testID="submit-hours-provider" />
            </Input>
          </FormField>
          <FormField label={t('training.submit.ce_course_number')} optional>
            <Input>
              <InputField value={ceCourseNumber} onChangeText={setCeCourseNumber} accessibilityLabel={t('training.submit.ce_course_number')} testID="submit-hours-course-number" />
            </Input>
          </FormField>
          <FormField label={t('training.submit.ce_hours')} optional error={message(errors.ceHours)}>
            <Input>
              <InputField value={ceHours} onChangeText={setCeHours} keyboardType="decimal-pad" accessibilityLabel={t('training.submit.ce_hours')} testID="submit-hours-ce-hours" />
            </Input>
          </FormField>
          <FormField label={t('training.submit.notes')} optional last>
            <Textarea>
              <TextareaInput value={notes} onChangeText={setNotes} accessibilityLabel={t('training.submit.notes')} testID="submit-hours-notes" />
            </Textarea>
          </FormField>
        </SectionCard>
        <SectionCard title={t('training.submit.evidence')} description={t('training.submit.evidence_description')}>
          <EvidencePicker files={files} onChange={setFiles} max={MAX_EVIDENCE_FILES} error={errors.files ? t(errors.files) : null} testID="submit-hours" />
        </SectionCard>
        <Button size="lg" onPress={() => void save()} isDisabled={isSaving} testID="submit-hours-save">
          {isSaving ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{t('training.submit.send')}</ButtonText>}
        </Button>
      </KeyboardAwareScrollView>
      <OptionSheet
        isOpen={sheet === 'category'}
        onClose={() => setSheet(null)}
        title={t('training.submit.category')}
        options={categoryOptions}
        selected={categoryId === null ? null : String(categoryId)}
        onSelect={(value) => {
          setCategoryId(Number(value));
          setSheet(null);
        }}
        testID="submit-hours-category-sheet"
      />
      <OptionSheet
        isOpen={sheet === 'method'}
        onClose={() => setSheet(null)}
        title={t('training.submit.method')}
        options={methodOptions}
        selected={method === null ? null : String(method)}
        onSelect={(value) => {
          setMethod(Number(value));
          setSheet(null);
        }}
        testID="submit-hours-method-sheet"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
});
