import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import type {
  LearningRecordData,
  LmsAcademyLessonData,
  LmsCatalogCourseData,
  LmsCertificationProgressData,
  LmsMyCourseData,
  LmsMyPathData,
  LmsMyPathStepData,
  ProtocolMicroLearningItem,
  TrainingAssignmentData,
  TrainingCatalogData,
  TrainingCertificationData,
} from '@resgrid/models';
import { Button, ButtonText, HStack, Pressable, Progress, ProgressFilledTrack, Text, useThemeColors, VStack } from '@resgrid/ui';
import type { LucideIcon } from 'lucide-react-native';
import { Award, BookOpen, CheckCircle2, Circle, FileText, GraduationCap, Lightbulb, Lock, Route } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { QuizForm } from '../../protocols/components/quiz-form';
import { assignmentStateKey, courseStatusKey, recordSourceKey, recordStatusKey } from '../lib/training-format';

/** A progress track with its value in words for assistive technology (the percentage is also printed beside it). */
const Track: React.FC<{ percent: number; label: string }> = ({ percent, label }) => (
  <Progress value={Math.max(0, Math.min(100, percent))} size="sm" accessibilityLabel={label}>
    <ProgressFilledTrack />
  </Progress>
);

const useDate = () => {
  const timeZone = useDepartmentTimeZone();

  return (value: string | null | undefined): string => (value ? formatUtcInDepartmentTime(value, timeZone, { dateStyle: 'medium' }) : '');
};

interface RowShellProps {
  icon: LucideIcon;
  iconColor?: string;
  title: string;
  meta: string;
  status?: string;
  statusTone?: 'normal' | 'warning' | 'error' | 'success';
  onPress?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
  testID: string;
}

const TONES: Record<NonNullable<RowShellProps['statusTone']>, string> = {
  normal: 'text-typography-600',
  warning: 'text-warning-700',
  error: 'text-error-600',
  success: 'text-success-700',
};

/** One row of the Training lists: an icon paired with text, the title, a meta line and the state in words (never colour alone). */
const RowShell: React.FC<RowShellProps> = ({ icon: Icon, iconColor, title, meta, status, statusTone = 'normal', onPress, disabled, children, testID }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const body = (
    <VStack space="xs">
      <HStack space="md" className="items-center">
        <View>
          <Icon size={20} color={iconColor ?? colors.primary} />
        </View>
        <VStack className="flex-1">
          <Text className="font-semibold text-typography-900">{title}</Text>
          {meta ? (
            <Text size="xs" className="text-typography-500">
              {meta}
            </Text>
          ) : null}
        </VStack>
        {status ? (
          <Text size="xs" className={TONES[statusTone]} testID={`${testID}-status`}>
            {status}
          </Text>
        ) : null}
      </HStack>
      {children}
    </VStack>
  );

  return onPress ? (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityHint={t('training.open_hint')}
      testID={testID}
      className="mb-2 rounded-xl border border-outline-100 bg-background-0 p-3"
    >
      {body}
    </Pressable>
  ) : (
    <View className="mb-2 rounded-xl border border-outline-100 bg-background-0 p-3" testID={testID}>
      {body}
    </View>
  );
};

export const AssignmentRow: React.FC<{ assignment: TrainingAssignmentData; onOpen: (id: number) => void }> = ({ assignment, onOpen }) => {
  const { t } = useTranslation();
  const date = useDate();
  const overdue = assignment.StateName === 'Overdue';

  const meta = [
    assignment.DueOn ? t('training.due_on', { date: date(assignment.DueOn) }) : null,
    assignment.Hours ? t('training.hours', { count: assignment.Hours }) : null,
    assignment.HasQuiz ? t('training.has_quiz') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <RowShell
      icon={assignment.Complete ? CheckCircle2 : FileText}
      title={assignment.Name ?? ''}
      meta={meta}
      status={t(assignmentStateKey(assignment))}
      statusTone={overdue ? 'error' : assignment.Complete ? 'success' : 'normal'}
      onPress={() => onOpen(assignment.TrainingId)}
      testID={`training-assignment-${assignment.TrainingId}`}
    />
  );
};

export const CourseRow: React.FC<{ course: LmsMyCourseData; onOpen: (enrollmentId: number) => void }> = ({ course, onOpen }) => {
  const { t } = useTranslation();
  const date = useDate();

  const meta = [
    course.IsAcademy ? t('training.academy') : null,
    course.VersionLabel ? t('protocols.version_label', { label: course.VersionLabel }) : null,
    course.DueOn ? t('training.due_on', { date: date(course.DueOn) }) : null,
    course.Hours ? t('training.hours', { count: course.Hours }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const runnable = course.CanRun || course.Status === 'Completed';

  return (
    <RowShell
      icon={runnable ? GraduationCap : Lock}
      title={course.Title ?? ''}
      meta={meta}
      status={runnable ? t(courseStatusKey(course)) : t('training.not_available')}
      statusTone={course.IsOverdue ? 'error' : course.Status === 'Completed' ? 'success' : 'normal'}
      onPress={() => onOpen(course.EnrollmentId)}
      disabled={!runnable}
      testID={`training-course-${course.EnrollmentId}`}
    >
      <View>
        <Track percent={course.ProgressPercent} label={t('training.progress', { percent: course.ProgressPercent })} />
        <Text size="xs" className="mt-1 text-typography-500">
          {t('training.progress', { percent: course.ProgressPercent })}
        </Text>
      </View>
    </RowShell>
  );
};

const stepIcon = (step: LmsMyPathStepData): LucideIcon => (step.State === 'Done' ? CheckCircle2 : step.State === 'Locked' ? Lock : Circle);

export const PathCard: React.FC<{ path: LmsMyPathData; onOpenCourse: (enrollmentId: number) => void; onOpenTraining: (trainingId: number) => void }> = ({ path, onOpenCourse, onOpenTraining }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const date = useDate();
  const percent = path.Needed > 0 ? Math.round((Math.min(path.Done, path.Needed) / path.Needed) * 100) : 0;

  return (
    <RowShell
      icon={Route}
      title={path.Title ?? ''}
      meta={[path.IsAcademy ? t('training.academy') : null, path.DueOn ? t('training.due_on', { date: date(path.DueOn) }) : null].filter(Boolean).join(' · ')}
      status={path.CompletedOn ? t('training.state.complete') : t('training.path_progress', { done: path.Done, needed: path.Needed })}
      statusTone={path.CompletedOn ? 'success' : 'normal'}
      testID={`training-path-${path.PathId}`}
    >
      <Track percent={percent} label={t('training.path_progress', { done: path.Done, needed: path.Needed })} />
      {(path.Steps ?? []).map((step) => {
        const Icon = stepIcon(step);
        const enrollmentId = step.EnrollmentId;
        const open = step.State === 'Locked' ? undefined : step.Kind === 'Course' && enrollmentId ? () => onOpenCourse(enrollmentId) : step.Kind === 'Training' ? () => onOpenTraining(step.TargetId) : undefined;

        return (
          <Pressable key={step.Order} onPress={open} disabled={!open} accessibilityRole={open ? 'button' : undefined} testID={`training-path-${path.PathId}-step-${step.Order}`} className="flex-row items-center py-1">
            <View>
              <Icon size={16} color={step.State === 'Done' ? colors.success : colors.icon} />
            </View>
            <Text size="sm" className="ml-2 flex-1 text-typography-800">
              {step.Title ?? ''}
            </Text>
            <Text size="xs" className="text-typography-500">
              {t(step.State === 'Done' ? 'training.state.complete' : step.State === 'Locked' ? 'training.locked' : 'training.available')}
            </Text>
          </Pressable>
        );
      })}
    </RowShell>
  );
};

export const CatalogRow: React.FC<{ item: TrainingCatalogData; onOpen: (id: number) => void; onEnroll: (id: number) => void; isBusy: boolean }> = ({ item, onOpen, onEnroll, isBusy }) => {
  const { t } = useTranslation();

  return (
    <RowShell
      icon={BookOpen}
      title={item.Name ?? ''}
      meta={[item.Summary, item.Hours ? t('training.hours', { count: item.Hours }) : null].filter(Boolean).join(' · ')}
      onPress={() => onOpen(item.TrainingId)}
      testID={`training-catalog-${item.TrainingId}`}
    >
      {item.CanSelfEnroll ? (
        <Button size="sm" variant="outline" className="self-start" onPress={() => onEnroll(item.TrainingId)} isDisabled={isBusy} testID={`training-catalog-${item.TrainingId}-enroll`}>
          <ButtonText>{t('training.enroll')}</ButtonText>
        </Button>
      ) : null}
    </RowShell>
  );
};

export const AcademyRow: React.FC<{ lesson: LmsAcademyLessonData; onOpen: (enrollmentId: number) => void; onEnroll: (courseId: number) => void; isBusy: boolean }> = ({ lesson, onOpen, onEnroll, isBusy }) => {
  const { t } = useTranslation();
  const enrollmentId = lesson.EnrollmentId;

  return (
    <RowShell
      icon={GraduationCap}
      title={lesson.Title ?? ''}
      meta={[t('training.academy'), t('training.minutes', { count: Math.round(lesson.Minutes) })].join(' · ')}
      status={lesson.Completed ? t('training.state.complete') : undefined}
      statusTone="success"
      onPress={enrollmentId ? () => onOpen(enrollmentId) : undefined}
      testID={`training-academy-${lesson.LessonId}`}
    >
      {!lesson.EnrollmentId ? (
        <Button size="sm" variant="outline" className="self-start" onPress={() => onEnroll(lesson.CourseId)} isDisabled={isBusy} testID={`training-academy-${lesson.LessonId}-enroll`}>
          <ButtonText>{t('training.start')}</ButtonText>
        </Button>
      ) : null}
    </RowShell>
  );
};

export interface RecordRowProps {
  record: LearningRecordData;
  /** Opens the record's certificate of completion (verified records). */
  onCertificate?: (record: LearningRecordData) => void;
  /** Opens the reply to a reviewer who asked for more information. */
  onRespond?: (record: LearningRecordData) => void;
  isBusy?: boolean;
}

/** A reviewer sent the submission back asking for more information (Core `TrainingSubmissionReviewStates.InfoRequested`). */
export const isInfoRequested = (record: Pick<LearningRecordData, 'ReviewState'>): boolean => record.ReviewState === 'InfoRequested';

export const RecordRow: React.FC<RecordRowProps> = ({ record, onCertificate, onRespond, isBusy = false }) => {
  const { t } = useTranslation();
  const date = useDate();
  const infoRequested = isInfoRequested(record);

  const meta = [date(record.CompletedOn), t(recordSourceKey(record)), record.CategoryName, t('training.hours', { count: record.Hours }), record.CeHours ? t('training.ce_hours', { count: record.CeHours }) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <RowShell
      icon={FileText}
      title={record.Title ?? ''}
      meta={meta}
      status={t(infoRequested ? 'training.transcript.info_requested' : recordStatusKey(record))}
      statusTone={record.Status === 1 ? 'success' : record.Status === 2 || infoRequested ? 'error' : 'warning'}
      testID={`training-record-${record.Id}`}
    >
      {(record.Status === 2 || infoRequested) && record.ReviewNote ? (
        <Text size="xs" className="text-typography-600">
          {record.ReviewNote}
        </Text>
      ) : null}
      {infoRequested && onRespond ? (
        <Button size="sm" className="self-start" onPress={() => onRespond(record)} testID={`training-record-${record.Id}-respond`}>
          <ButtonText>{t('training.respond.button')}</ButtonText>
        </Button>
      ) : null}
      {record.Status === 1 && onCertificate ? (
        <Button size="sm" variant="outline" className="self-start" onPress={() => onCertificate(record)} isDisabled={isBusy} testID={`training-record-${record.Id}-certificate`}>
          <ButtonText>{t('training.transcript.certificate')}</ButtonText>
        </Button>
      ) : null}
    </RowShell>
  );
};

export const CertificationRow: React.FC<{ certification: TrainingCertificationData }> = ({ certification }) => {
  const { t } = useTranslation();
  const date = useDate();

  return (
    <RowShell
      icon={Award}
      title={certification.Name ?? ''}
      meta={certification.ExpiresOn ? t('training.expires_on', { date: date(certification.ExpiresOn) }) : ''}
      status={certification.IsExpired ? t('training.cert_expired') : certification.DueSoon ? t('training.cert_due_soon', { count: certification.DaysLeft ?? 0 }) : undefined}
      statusTone={certification.IsExpired ? 'error' : 'warning'}
      testID={`training-certification-${certification.CertificationId}`}
    />
  );
};

export const CertificationProgressCard: React.FC<{ progress: LmsCertificationProgressData }> = ({ progress }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const date = useDate();
  const percent = progress.Total > 0 ? Math.round((progress.Done / progress.Total) * 100) : 0;

  return (
    <RowShell
      icon={Award}
      title={progress.CertificationTypeName ?? progress.CertificationTypeCode ?? ''}
      meta={progress.ExpiresOn ? t('training.expires_on', { date: date(progress.ExpiresOn) }) : ''}
      status={t('training.cert_progress', { done: progress.Done, total: progress.Total })}
      testID={`training-cert-progress-${progress.CertificationTypeId}`}
    >
      <Track percent={percent} label={t('training.cert_progress', { done: progress.Done, total: progress.Total })} />
      {(progress.Items ?? []).map((item) => (
        <HStack key={item.ItemId} space="sm" className="items-center py-0.5">
          <View>{item.Done ? <CheckCircle2 size={14} color={colors.success} /> : <Circle size={14} color={colors.icon} />}</View>
          <Text size="xs" className="flex-1 text-typography-700">
            {item.Label ?? ''}
          </Text>
        </HStack>
      ))}
    </RowShell>
  );
};

/** A self-enrollable department course (LMS catalog): enrol, or open the enrollment the member already has. */
export const CatalogCourseRow: React.FC<{ course: LmsCatalogCourseData; onOpen: (enrollmentId: number) => void; onEnroll: (courseId: number) => void; isBusy: boolean }> = ({ course, onOpen, onEnroll, isBusy }) => {
  const { t } = useTranslation();
  const enrollmentId = course.OpenEnrollmentId;
  const meta = [course.Summary, course.VersionLabel ? t('protocols.version_label', { label: course.VersionLabel }) : null, course.Hours ? t('training.hours', { count: course.Hours }) : null].filter(Boolean).join(' · ');

  return (
    <RowShell icon={GraduationCap} title={course.Title ?? ''} meta={meta} onPress={enrollmentId ? () => onOpen(enrollmentId) : undefined} testID={`training-catalog-course-${course.CourseId}`}>
      {!enrollmentId && course.CanEnroll ? (
        <Button size="sm" variant="outline" className="self-start" onPress={() => onEnroll(course.CourseId)} isDisabled={isBusy} testID={`training-catalog-course-${course.CourseId}-enroll`}>
          <ButtonText>{t('training.enroll')}</ButtonText>
        </Button>
      ) : null}
    </RowShell>
  );
};

/** One weekly micro-learning question (LMS): answered once; then the result and the explanation. */
export const WeeklyQuestionCard: React.FC<{ item: ProtocolMicroLearningItem; onAnswer: (id: number, keys: string[]) => void; isBusy: boolean }> = ({ item, onAnswer, isBusy }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const question = item.Question;
  const answered = !!item.AnsweredOn;

  return (
    <RowShell
      icon={Lightbulb}
      title={[item.ProtocolCode, item.ProtocolName].filter(Boolean).join(' · ')}
      meta=""
      status={answered ? t(item.Correct ? 'training.weekly.correct' : 'training.weekly.incorrect') : undefined}
      statusTone={item.Correct ? 'success' : 'error'}
      testID={`training-weekly-${item.Id}`}
    >
      {question && !answered ? (
        <QuizForm
          questions={[{ id: String(question.QuestionId), text: question.Text ?? '', multiple: question.Kind === 1, options: (question.Options ?? []).map((option) => ({ key: option.Key, text: option.Text ?? '' })) }]}
          onSubmit={(submission) => onAnswer(item.Id, submission.keys[String(question.QuestionId)] ?? [])}
          isSubmitting={isBusy}
          testID={`training-weekly-${item.Id}-quiz`}
        />
      ) : null}
      {question && answered ? (
        <VStack space="xs">
          <Text size="sm" className="text-typography-800">
            {question.Text ?? ''}
          </Text>
          {(question.Options ?? [])
            .filter((option) => (item.CorrectKeys ?? []).includes(option.Key))
            .map((option) => (
              <HStack key={option.Key} space="xs" className="items-center">
                <View>
                  <CheckCircle2 size={14} color={colors.success} />
                </View>
                <Text size="sm" className="text-typography-700">
                  {option.Text ?? ''}
                </Text>
              </HStack>
            ))}
          {item.Explanation ? (
            <Text size="xs" className="text-typography-600">
              {item.Explanation}
            </Text>
          ) : null}
        </VStack>
      ) : null}
    </RowShell>
  );
};
