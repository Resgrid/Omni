import { FeatureFlagKeys, useFeatureFlag } from '@resgrid/auth';
import { downloadLessonFile, useProtocolsStore, useTrainingStore } from '@resgrid/data';
import { FileList } from '@resgrid/features/protocols/components/file-list';
import { QuizForm, type QuizSubmission } from '@resgrid/features/protocols/components/quiz-form';
import { useTranslation } from '@resgrid/i18n';
import type { LmsAttemptOutcomeResult, LmsAttemptResult, LmsLessonData, ProtocolVersionContentData } from '@resgrid/models';
import {
  Button,
  ButtonSpinner,
  ButtonText,
  HStack,
  HtmlRenderer,
  KeyboardAwareScrollView,
  Loading,
  Pressable,
  ScreenHeader,
  showToast,
  Spinner,
  Text,
  Textarea,
  TextareaInput,
  useThemeColors,
  View,
  VStack,
  ZeroState,
} from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, Circle, ExternalLink, GraduationCap, Lock } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';

import { EvidencePicker } from '../components/evidence-picker';
import { HostedVideoPlayer } from '../components/hosted-video-player';
import { LessonLaunchPanel, LessonLaunchPlayer, useLessonLaunch } from '../components/lesson-launch';
import { SurveyForm } from '../components/survey-form';
import { type EvidenceFile, MAX_EVIDENCE_FILE_BYTES } from '../lib/evidence';
import { isLaunchLesson } from '../lib/lesson-launch';
import { assessmentQuestions, currentLesson, HEARTBEAT_SECONDS, isPlayableLesson, lmsErrorKey, lmsVisibility } from '../lib/training-format';
import { watchedPercent } from '../lib/webvtt';
import { parseTrainingRouteId, trainingRoutes } from '../routes';

export interface CoursePlayerScreenProps {
  enrollmentId?: number;
}

const httpsOnly = (url: string | null | undefined): string | null => (url && /^https:\/\//i.test(url) ? url : null);

/** Video progress for the heartbeat: where the member is and the furthest point reached, of how long. */
interface VideoProgress {
  position: number;
  furthest: number;
  duration: number;
}

/**
 * Seat time while a lesson is open: a heartbeat every HEARTBEAT_SECONDS and the rest when the lesson closes (the server caps it by
 * its clock), with the video position and watched percent for a hosted video lesson.
 */
function useSeatTime(enrollmentId: number | null, lessonId: number | null, video: React.RefObject<VideoProgress | null>): void {
  const since = useRef(Date.now());

  useEffect(() => {
    if (!enrollmentId || !lessonId) return undefined;
    since.current = Date.now();

    const flush = () => {
      const seconds = (Date.now() - since.current) / 1000;
      const progress = video.current;

      since.current = Date.now();

      if (seconds >= 1)
        void useTrainingStore.getState().saveProgress(enrollmentId, lessonId, seconds, progress ? { positionSeconds: progress.position, watchedPercent: watchedPercent(progress.furthest, progress.duration) } : undefined);
    };

    const timer = setInterval(flush, HEARTBEAT_SECONDS * 1000);

    return () => {
      clearInterval(timer);
      flush();
    };
  }, [enrollmentId, lessonId, video]);
}

const LessonOutline: React.FC<{ lessons: readonly LmsLessonData[]; selectedId: number | null; onSelect: (lesson: LmsLessonData) => void }> = ({ lessons, selectedId, onSelect }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <VStack className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-2" testID="course-outline">
      {lessons.map((lesson, index) => {
        const Icon = lesson.IsLocked ? Lock : lesson.Progress === 'Completed' ? CheckCircle2 : Circle;
        const moduleTitle = index === 0 || lessons[index - 1]?.ModuleId !== lesson.ModuleId ? lesson.ModuleTitle : null;

        return (
          <VStack key={lesson.LessonId}>
            {moduleTitle ? <Text className="px-2 pt-2 text-xs font-semibold uppercase text-typography-500">{moduleTitle}</Text> : null}
            <Pressable
              onPress={lesson.IsLocked ? undefined : () => onSelect(lesson)}
              disabled={lesson.IsLocked}
              accessibilityRole="button"
              accessibilityState={{ selected: lesson.LessonId === selectedId, disabled: lesson.IsLocked }}
              accessibilityLabel={`${lesson.Title ?? ''}, ${t(lesson.IsLocked ? 'training.locked' : lesson.Progress === 'Completed' ? 'training.state.complete' : 'training.available')}`}
              testID={`course-lesson-${lesson.LessonId}`}
              className={`flex-row items-center rounded-lg px-2 py-2 ${lesson.LessonId === selectedId ? 'bg-primary-50' : ''}`}
            >
              <View>
                <Icon size={16} color={lesson.Progress === 'Completed' ? colors.success : colors.icon} />
              </View>
              <Text size="sm" className="ml-2 flex-1 text-typography-900">
                {lesson.Title ?? ''}
              </Text>
            </Pressable>
          </VStack>
        );
      })}
    </VStack>
  );
};

/** A ProtocolVersion lesson: the protocol version the course points at, in the reader's language (the lesson's own HTML when none). */
const ProtocolVersionLesson: React.FC<{ lesson: LmsLessonData }> = ({ lesson }) => {
  const { i18n } = useTranslation();
  const versionId = lesson.ProtocolVersionId ? String(lesson.ProtocolVersionId) : null;
  const [content, setContent] = useState<ProtocolVersionContentData | null>(null);
  const [isLoading, setIsLoading] = useState(versionId !== null);
  const locale = i18n?.language;

  useEffect(() => {
    let current = true;

    if (!versionId) return undefined;
    setIsLoading(true);
    void useProtocolsStore
      .getState()
      .fetchVersionContent(versionId, { locale })
      .then((value) => {
        if (current) setContent(value);
      })
      .finally(() => {
        if (current) setIsLoading(false);
      });

    return () => {
      current = false;
    };
  }, [locale, versionId]);

  const html = content?.ContentHtml || lesson.ContentHtml;

  if (isLoading) return <Spinner testID="course-lesson-protocol-loading" />;

  return html ? <HtmlRenderer html={html} rendererKey={`lesson-${lesson.LessonId}-protocol`} autoHeight testID="course-lesson-protocol" /> : null;
};

/**
 * The LMS course player (`/training/course/[id]`, an enrollment): the outline with each lesson's progress and lock, the lesson in the
 * centre — content, the protocol version it points at, a hosted video played in the app with captions (or a linked one), a document,
 * a free response, a file to upload, a survey — with "Mark complete" (Core checks seat time, watched percent, the response and the
 * file), and assessments drawn and scored on the server. SCORM, cmi5 and LTI lessons play in the app through Core's signed launch
 * (round 10 A8; full screen, with the system browser for LTI tools that refuse the embedded view); live sessions are taken on the
 * web. Seat time and video progress are reported while a lesson is open.
 */
export default function CoursePlayerScreen({ enrollmentId: enrollmentIdProp }: CoursePlayerScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const enrollmentId = enrollmentIdProp ?? parseTrainingRouteId(params.id);
  const course = useTrainingStore((state) => (enrollmentId ? state.coursesByEnrollment[enrollmentId] : undefined));
  const isLoading = useTrainingStore((state) => state.loading.course === true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [response, setResponse] = useState('');
  const [upload, setUpload] = useState<EvidenceFile[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [attempt, setAttempt] = useState<LmsAttemptResult | null>(null);
  const [outcome, setOutcome] = useState<LmsAttemptOutcomeResult | null>(null);
  const video = useRef<VideoProgress | null>(null);
  const access = useTrainingStore((state) => state.access);
  const lmsFlag = useFeatureFlag(FeatureFlagKeys.TrainingLms);

  const reload = useCallback(async () => {
    if (enrollmentId) await useTrainingStore.getState().fetchCourse(enrollmentId, { bypassCache: true });
  }, [enrollmentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const lessons = useMemo(() => course?.Lessons ?? [], [course]);
  const lesson = useMemo(() => lessons.find((item) => item.LessonId === selectedId) ?? currentLesson(lessons, course?.CurrentLessonId), [course?.CurrentLessonId, lessons, selectedId]);
  const isHostedVideo = lesson?.Kind === 'Video' && lesson.VideoSource === 'Hosted';
  // The lesson on screen now: an answer that comes back after the member moved on is not shown under another lesson.
  const shown = useRef<string | null>(null);

  shown.current = enrollmentId && lesson ? `${enrollmentId}:${lesson.LessonId}` : null;

  useEffect(() => {
    video.current = isHostedVideo && lesson ? { position: lesson.VideoPositionSeconds, furthest: lesson.VideoPositionSeconds, duration: 0 } : null;
  }, [isHostedVideo, lesson]);

  useSeatTime(enrollmentId, lesson && !lesson.IsLocked ? lesson.LessonId : null, video);

  const launch = useLessonLaunch(enrollmentId, lesson && isLaunchLesson(lesson) ? lesson : null, reload);

  const onVideoProgress = useCallback((position: number, duration: number) => {
    const current = video.current;

    if (current) video.current = { position, furthest: Math.max(current.furthest, position), duration };
  }, []);

  const select = (next: LmsLessonData) => {
    setSelectedId(next.LessonId);
    setResponse('');
    setUpload([]);
    setAttempt(null);
    setOutcome(null);
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace(trainingRoutes.home()));

  if (!course || !lesson || !enrollmentId) {
    return (
      <View className="flex-1 bg-background-50" testID="course-player-screen">
        <ScreenHeader title={t('training.course')} onBack={back} />
        {isLoading && enrollmentId ? <Loading /> : <ZeroState icon={GraduationCap} heading={t('training.course_not_found')} onRetry={enrollmentId ? reload : undefined} testID="course-player-missing" />}
      </View>
    );
  }

  if (launch.state.kind === 'playing') return <LessonLaunchPlayer lesson={lesson} launch={launch.state.launch} controls={launch} />;

  // The seat and lapse rules (GetMyAccess): a department course launches only while the LMS is the member's (or kept through a lapse).
  const visibility = lmsVisibility(access, lmsFlag);
  const mayLaunch = course.Course?.IsAcademy === true || visibility.departmentLms || (visibility.keepEnrolled && course.Course?.CanRun === true);

  const report = (result: { value: { CourseCompleted: boolean } | null; error: string | null }) => {
    if (result.value) showToast('success', t(result.value.CourseCompleted ? 'training.course_completed' : 'training.lesson_completed'));
    else showToast('error', t(lmsErrorKey(result.error)));
  };

  const complete = async () => {
    const file = upload[0];

    if (file && file.bytes > MAX_EVIDENCE_FILE_BYTES) {
      showToast('error', t('training.errors.file_too_large'));

      return;
    }

    setIsBusy(true);

    try {
      const target = shown.current;
      const extra = { responseText: response.trim() || undefined, file: file ? { name: file.name, contentType: file.contentType, base64: file.base64 } : undefined };
      const result = await useTrainingStore.getState().completeLesson(enrollmentId, lesson.LessonId, extra);

      report(result);

      if (result.value && shown.current === target) setUpload([]);
    } finally {
      setIsBusy(false);
    }
  };

  const submitSurvey = async (answers: Record<string, string>) => {
    setIsBusy(true);

    try {
      report(await useTrainingStore.getState().submitSurvey(enrollmentId, lesson.LessonId, answers));
    } finally {
      setIsBusy(false);
    }
  };

  const startAttempt = async () => {
    setIsBusy(true);

    try {
      const target = shown.current;
      const result = await useTrainingStore.getState().startAttempt(enrollmentId, lesson.LessonId, true);

      // The member chose another lesson meanwhile: this attempt's questions belong to the one they left.
      if (shown.current !== target) return;

      if (result.value) {
        setAttempt(result.value);
        setOutcome(null);
      } else showToast('error', t(lmsErrorKey(result.error)));
    } finally {
      setIsBusy(false);
    }
  };

  const submitAttempt = async (submission: QuizSubmission) => {
    if (!attempt) return;
    setIsBusy(true);

    try {
      const answers = (attempt.Questions ?? []).map((question) => ({
        QuestionId: question.QuestionId,
        Keys: submission.keys[String(question.QuestionId)] ?? [],
        Text: submission.texts[String(question.QuestionId)] ?? null,
      }));

      const target = shown.current;
      const result = await useTrainingStore.getState().submitAttempt(attempt.AttemptId, answers);

      if (shown.current !== target) {
        // Scored for the lesson the member left: the course is read again, but the outcome is not shown under this one.
        if (result.value) void reload();

        return;
      }

      if (result.value) {
        setOutcome(result.value);
        setAttempt(null);
        void reload();
      } else showToast('error', t(lmsErrorKey(result.error)));
    } finally {
      setIsBusy(false);
    }
  };

  const videoUrl = httpsOnly(lesson.VideoUrl);
  const documentUrl = httpsOnly(lesson.DocumentUrl);
  const isAssessment = lesson.Kind === 'Assessment';
  const isSurvey = lesson.Kind === 'Survey';
  const completed = lesson.Progress === 'Completed';
  const awaiting = outcome?.Questions.some((question) => question.AwaitingGrade) === true;
  const files = (lesson.Files ?? []).map((file) => ({ id: String(file.LessonFileId), name: file.FileName ?? '', type: file.ContentType, size: file.Size }));
  const needsFile = !!lesson.FileRequestPrompt && !completed;

  return (
    <View className="flex-1 bg-background-50" testID="course-player-screen">
      <ScreenHeader title={course.Course?.Title ?? t('training.course')} onBack={back} />
      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text size="sm" className="mb-2 text-typography-600" testID="course-progress">
          {t('training.progress', { percent: course.Course?.ProgressPercent ?? 0 })}
        </Text>
        <LessonOutline lessons={lessons} selectedId={lesson.LessonId} onSelect={select} />
        <View className="mb-3 rounded-xl border border-outline-200 bg-background-0 p-4" testID={`course-lesson-view-${lesson.LessonId}`}>
          <Text className="mb-2 font-semibold text-typography-900" accessibilityRole="header">
            {lesson.Title ?? ''}
          </Text>
          {!isPlayableLesson(lesson) && !isLaunchLesson(lesson) ? (
            <Text size="sm" className="text-typography-600" testID="course-lesson-web-only">
              {t('training.web_only_lesson')}
            </Text>
          ) : null}
          {isLaunchLesson(lesson) && !lesson.IsLocked ? <LessonLaunchPanel lesson={lesson} controls={launch} canLaunch={mayLaunch} refusal={course.Error ?? null} /> : null}
          {lesson.Kind === 'ProtocolVersion' ? (
            <ProtocolVersionLesson key={lesson.LessonId} lesson={lesson} />
          ) : lesson.ContentHtml ? (
            <HtmlRenderer html={lesson.ContentHtml} rendererKey={`lesson-${lesson.LessonId}`} autoHeight testID="course-lesson-html" />
          ) : null}
          {lesson.Kind === 'Video' ? (
            isHostedVideo ? (
              lesson.IsLocked ? null : (
                <HostedVideoPlayer
                  key={lesson.LessonId}
                  enrollmentId={enrollmentId}
                  lessonId={lesson.LessonId}
                  lessonCaptions={lesson.Captions ?? []}
                  resumeAt={lesson.VideoPositionSeconds}
                  onProgress={onVideoProgress}
                />
              )
            ) : videoUrl ? (
              <Button variant="outline" className="mt-3" onPress={() => void Linking.openURL(videoUrl)} testID="course-lesson-video">
                <View>
                  <ExternalLink size={16} color={colors.primary} />
                </View>
                <ButtonText>{t('training.watch_video')}</ButtonText>
              </Button>
            ) : null
          ) : null}
          {lesson.TranscriptText ? (
            <Text size="sm" className="mt-3 text-typography-700">
              {lesson.TranscriptText}
            </Text>
          ) : null}
          {documentUrl ? (
            <Button variant="outline" className="mt-3" onPress={() => void Linking.openURL(documentUrl)} testID="course-lesson-document">
              <View>
                <ExternalLink size={16} color={colors.primary} />
              </View>
              <ButtonText>{t('training.open_document')}</ButtonText>
            </Button>
          ) : null}
          {lesson.FreeResponsePrompt && !completed ? (
            <VStack space="xs" className="mt-3">
              <Text size="sm" className="text-typography-800">
                {lesson.FreeResponsePrompt}
              </Text>
              <Textarea>
                <TextareaInput value={response} onChangeText={setResponse} placeholder={t('protocols.quiz.your_answer')} accessibilityLabel={lesson.FreeResponsePrompt} testID="course-lesson-response" />
              </Textarea>
            </VStack>
          ) : null}
          {needsFile ? (
            <VStack space="xs" className="mt-3" testID="course-lesson-file-request">
              <Text size="sm" className="text-typography-800">
                {lesson.FileRequestPrompt}
              </Text>
              <EvidencePicker files={upload} onChange={setUpload} max={1} testID="course-lesson-upload" />
            </VStack>
          ) : null}
          {files.length > 0 ? (
            <VStack space="xs" className="mt-3">
              <Text size="sm" className="font-semibold text-typography-800">
                {t('training.my_uploads')}
              </Text>
              <FileList files={files} download={(id) => downloadLessonFile(Number(id))} testID="course-lesson-files" />
            </VStack>
          ) : null}
          {isSurvey && !completed && !lesson.IsLocked ? (
            <View style={styles.quiz}>
              <SurveyForm key={lesson.LessonId} questions={lesson.SurveyQuestions ?? []} onSubmit={(answers) => void submitSurvey(answers)} isSubmitting={isBusy} testID="course-survey" />
            </View>
          ) : null}
          {outcome ? (
            <Text className={`mt-3 font-semibold ${outcome.Passed ? 'text-success-700' : awaiting ? 'text-typography-700' : 'text-error-600'}`} testID="course-attempt-outcome">
              {awaiting ? t('training.awaiting_grade') : t(outcome.Passed ? 'protocols.quiz.passed' : 'protocols.quiz.failed', { percent: Math.round(outcome.Percent) })}
            </Text>
          ) : null}
          {isAssessment && attempt ? (
            <View style={styles.quiz}>
              {attempt.SecondsRemaining ? (
                <Text size="xs" className="mb-2 text-typography-500">
                  {t('training.time_limit', { count: Math.ceil(attempt.SecondsRemaining / 60) })}
                </Text>
              ) : null}
              <QuizForm key={attempt.AttemptId} questions={assessmentQuestions(attempt.Questions)} onSubmit={(submission) => void submitAttempt(submission)} isSubmitting={isBusy} testID="course-attempt" />
            </View>
          ) : null}
          <HStack space="sm" className="mt-3">
            {isAssessment && !attempt && !completed && !lesson.IsLocked ? (
              <Button className="flex-1" onPress={() => void startAttempt()} isDisabled={isBusy} testID="course-attempt-start">
                {isBusy ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{t('training.start_assessment')}</ButtonText>}
              </Button>
            ) : null}
            {!isAssessment && !isSurvey && isPlayableLesson(lesson) && !completed && !lesson.IsLocked ? (
              <Button className="flex-1" onPress={() => void complete()} isDisabled={isBusy || (needsFile && upload.length === 0)} testID="course-lesson-complete">
                {isBusy ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{t('training.mark_complete')}</ButtonText>}
              </Button>
            ) : null}
          </HStack>
          {completed ? (
            <Text size="sm" className="mt-3 text-success-700" testID="course-lesson-done">
              {t('training.lesson_completed')}
            </Text>
          ) : null}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  quiz: { marginTop: 12 },
});
