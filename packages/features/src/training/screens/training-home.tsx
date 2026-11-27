import { FeatureFlagKeys, useFeatureFlag } from '@resgrid/auth';
import { FileOpenerUnavailableError, openFile } from '@resgrid/core/device/file-opener';
import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { downloadCertificate, downloadTranscriptPdf, isTrainingModuleOff, useProtocolAcknowledgmentsStore, useTrainingStore } from '@resgrid/data';
import { certificationsRoutes } from '@resgrid/features/certifications/routes';
import { useTranslation } from '@resgrid/i18n';
import type { LearningRecordData } from '@resgrid/models';
import { Button, ButtonText, HStack, Loading, RefreshControl, ScrollView, SharedTabs, showToast, Text, useRouteTab, useThemeColors, View, VStack, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { Award, GraduationCap, Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { AcademyRow, AssignmentRow, CatalogCourseRow, CatalogRow, CertificationProgressCard, CertificationRow, CourseRow, PathCard, RecordRow, WeeklyQuestionCard } from '../components/training-rows';
import { isAssignmentOpen, lmsVisibility, verifiedHours, visibleCourses, visiblePaths } from '../lib/training-format';
import { trainingRoutes } from '../routes';

const Section: React.FC<{ title: string; children: React.ReactNode; testID?: string }> = ({ title, children, testID }) => (
  <VStack className="mb-4" testID={testID}>
    <Text className="mb-2 text-sm font-semibold uppercase text-typography-600" accessibilityRole="header">
      {title}
    </Text>
    {children}
  </VStack>
);

/**
 * "Training" (Responder `training` module). Free for every department with the Trainings module on: the member's assigned
 * trainings, the open catalog, the free Resgrid Academy, the transcript, certifications due and outside CE/CPD submissions.
 * The LMS add-on adds department courses, learning paths and certification progress, shown only while the Training.Lms flag
 * is on and, per course, only while Core says it can run (the add-on is active, or a lapse window). A module switched off
 * answers 404 and the screen says so. Lists persist for offline reading.
 */
export default function TrainingHomeScreen() {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const lmsFlag = useFeatureFlag(FeatureFlagKeys.TrainingLms);
  const access = useTrainingStore((state) => state.access);
  const departmentCatalog = useTrainingStore((state) => state.catalog);
  const weekly = useProtocolAcknowledgmentsStore((state) => state.weekly);
  const visibility = useMemo(() => lmsVisibility(access, lmsFlag), [access, lmsFlag]);
  const lmsOn = visibility.departmentLms;
  const locale = i18n?.language;
  const [isDownloading, setIsDownloading] = useState(false);
  const my = useTrainingStore((state) => state.my);
  const courses = useTrainingStore((state) => state.courses);
  const paths = useTrainingStore((state) => state.paths);
  const academy = useTrainingStore((state) => state.academy);
  const transcript = useTrainingStore((state) => state.transcript);
  const certificationProgress = useTrainingStore((state) => state.certificationProgress);
  const myError = useTrainingStore((state) => state.errors.mine ?? null);
  const isLoading = useTrainingStore((state) => state.loading.mine === true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const routeTab = useRouteTab(HOME_TABS);

  const load = useCallback(
    async (bypassCache: boolean) => {
      const store = useTrainingStore.getState();
      // The member's LMS access first: what it allows decides which LMS lists are read at all.
      const current = await store.fetchAccess({ bypassCache });
      const lms = lmsVisibility(current, lmsFlag).departmentLms;
      const reads: Promise<unknown>[] = [store.fetchMyTrainings({ bypassCache }), store.fetchTranscript({ bypassCache }), store.fetchLearning({ bypassCache, lms })];

      if (lms) reads.push(useProtocolAcknowledgmentsStore.getState().fetchWeekly({ bypassCache }));
      await Promise.allSettled(reads);
    },
    [lmsFlag]
  );

  /** A PDF from Core (transcript or certificate), handed to the platform file opener. */
  const openPdf = useCallback(
    async (fetchPdf: () => Promise<{ data: ArrayBuffer; contentType: string | null }>, fileName: string) => {
      setIsDownloading(true);

      try {
        const { data, contentType } = await fetchPdf();

        await openFile({ data, fileName, contentType: contentType ?? 'application/pdf' });
      } catch (error) {
        showToast('error', t(error instanceof FileOpenerUnavailableError ? 'protocols.files.open_unavailable' : 'training.transcript.pdf_failed'));
      } finally {
        setIsDownloading(false);
      }
    },
    [t]
  );

  const answerWeekly = useCallback(
    async (id: number, keys: string[]) => {
      setBusyId(id);

      try {
        const answered = await useProtocolAcknowledgmentsStore.getState().answerWeekly(id, keys);

        if (!answered) showToast('error', t('training.errors.generic'));
      } finally {
        setBusyId(null);
      }
    },
    [t]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await load(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [load]);

  const openTraining = useCallback((id: number) => pushRoutePath(router, trainingRoutes.detail(id)), []);
  const openCourse = useCallback((enrollmentId: number) => pushRoutePath(router, trainingRoutes.course(enrollmentId)), []);

  const enrollTraining = useCallback(
    async (id: number) => {
      setBusyId(id);

      try {
        const done = await useTrainingStore.getState().selfEnroll(id);
        showToast(done ? 'success' : 'error', t(done ? 'training.enrolled' : 'training.errors.generic'));
      } finally {
        setBusyId(null);
      }
    },
    [t]
  );

  const enrollCourse = useCallback(
    async (courseId: number) => {
      setBusyId(courseId);

      try {
        const outcome = await useTrainingStore.getState().enrollCourse(courseId);
        const enrollmentId = outcome.value?.EnrollmentId;

        if (enrollmentId) openCourse(enrollmentId);
        else showToast('error', t('training.errors.generic'));
      } finally {
        setBusyId(null);
      }
    },
    [openCourse, t]
  );

  const assignments = useMemo(() => my?.Assignments ?? [], [my]);
  const open = useMemo(() => assignments.filter(isAssignmentOpen), [assignments]);
  const done = useMemo(() => assignments.filter((assignment) => !isAssignmentOpen(assignment)), [assignments]);
  const shownCourses = useMemo(() => visibleCourses(courses, visibility), [courses, visibility]);
  const openCourses = shownCourses.filter((course) => course.Status !== 'Completed');
  const doneCourses = shownCourses.filter((course) => course.Status === 'Completed');
  const shownPaths = useMemo(() => visiblePaths(paths, visibility), [paths, visibility]);
  const weeklyShown = lmsOn ? weekly.slice(0, 4) : [];
  const catalogShown = lmsOn ? departmentCatalog : [];
  const catalog = my?.Catalog ?? [];
  const academyAvailable = academy.filter((lesson) => !lesson.Completed);
  const certifications = my?.Certifications ?? [];
  const hours = useMemo(() => verifiedHours(transcript), [transcript]);

  const refreshControl = <RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} />;

  if (isTrainingModuleOff(myError) && !my) {
    return (
      <View className="flex-1 bg-background-50" testID="training-screen">
        <ZeroState icon={GraduationCap} heading={t('training.module_off')} description={t('training.module_off_description')} onRetry={refresh} testID="training-module-off" />
      </View>
    );
  }

  if (isLoading && !my && !isRefreshing) {
    return (
      <View className="flex-1 bg-background-50" testID="training-screen">
        <Loading />
      </View>
    );
  }

  if (myError && !my) {
    return (
      <View className="flex-1 bg-background-50" testID="training-screen">
        <ZeroState isError heading={t('training.load_failed')} description={t(myError.messageKey)} onRetry={refresh} testID="training-error" />
      </View>
    );
  }

  const assigned = (
    <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl} testID="training-assigned">
      {my?.OnLeave ? (
        <View className="mb-3 rounded-lg bg-info-50 p-3" testID="training-on-leave">
          <Text size="sm" className="text-info-800">
            {t('training.on_leave')}
          </Text>
        </View>
      ) : null}
      {open.length === 0 && openCourses.length === 0 && shownPaths.length === 0 ? (
        <ZeroState icon={GraduationCap} heading={t('training.nothing_due')} description={t('training.nothing_due_description')} onRetry={refresh} testID="training-assigned-empty" />
      ) : null}
      {open.length > 0 ? (
        <Section title={t('training.sections.assigned')} testID="training-section-assigned">
          {open.map((assignment) => (
            <AssignmentRow key={assignment.TrainingId} assignment={assignment} onOpen={openTraining} />
          ))}
        </Section>
      ) : null}
      {openCourses.length > 0 ? (
        <Section title={t('training.sections.courses')} testID="training-section-courses">
          {openCourses.map((course) => (
            <CourseRow key={course.EnrollmentId} course={course} onOpen={openCourse} />
          ))}
        </Section>
      ) : null}
      {weeklyShown.length > 0 ? (
        <Section title={t('training.sections.weekly')} testID="training-section-weekly">
          {weeklyShown.map((item) => (
            <WeeklyQuestionCard key={item.Id} item={item} onAnswer={(id, keys) => void answerWeekly(id, keys)} isBusy={busyId === item.Id} />
          ))}
        </Section>
      ) : null}
      {shownPaths.length > 0 ? (
        <Section title={t('training.sections.paths')} testID="training-section-paths">
          {shownPaths.map((path) => (
            <PathCard key={path.PathId} path={path} onOpenCourse={openCourse} onOpenTraining={openTraining} />
          ))}
        </Section>
      ) : null}
      {done.length > 0 || doneCourses.length > 0 ? (
        <Section title={t('training.sections.completed')} testID="training-section-completed">
          {done.map((assignment) => (
            <AssignmentRow key={assignment.TrainingId} assignment={assignment} onOpen={openTraining} />
          ))}
          {doneCourses.map((course) => (
            <CourseRow key={course.EnrollmentId} course={course} onOpen={openCourse} />
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );

  const available = (
    <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl} testID="training-available">
      {catalog.length === 0 && academyAvailable.length === 0 && catalogShown.length === 0 ? (
        <ZeroState icon={GraduationCap} heading={t('training.catalog_empty')} onRetry={refresh} testID="training-available-empty" />
      ) : null}
      {catalog.length > 0 ? (
        <Section title={t('training.sections.catalog')}>
          {catalog.map((item) => (
            <CatalogRow key={item.TrainingId} item={item} onOpen={openTraining} onEnroll={(id) => void enrollTraining(id)} isBusy={busyId === item.TrainingId} />
          ))}
        </Section>
      ) : null}
      {catalogShown.length > 0 ? (
        <Section title={t('training.sections.department_courses')} testID="training-section-department-courses">
          {catalogShown.map((item) => (
            <CatalogCourseRow key={item.CourseId} course={item} onOpen={openCourse} onEnroll={(courseId) => void enrollCourse(courseId)} isBusy={busyId === item.CourseId} />
          ))}
        </Section>
      ) : null}
      {academyAvailable.length > 0 ? (
        <Section title={t('training.sections.academy')} testID="training-section-academy">
          {academyAvailable.map((lesson) => (
            <AcademyRow key={lesson.LessonId} lesson={lesson} onOpen={openCourse} onEnroll={(courseId) => void enrollCourse(courseId)} isBusy={busyId === lesson.CourseId} />
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );

  const records = (
    <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl} testID="training-transcript">
      <HStack space="sm" className="mb-3 items-center">
        <Text className="flex-1 text-typography-700" testID="training-hours-total">
          {t('training.transcript.total_hours', { count: hours })}
        </Text>
        <Button size="sm" onPress={() => pushRoutePath(router, trainingRoutes.submit())} testID="training-submit-hours">
          <View>
            <Plus size={16} color={colors.textInverse} />
          </View>
          <ButtonText>{t('training.submit.button')}</ButtonText>
        </Button>
      </HStack>
      {transcript.length > 0 ? (
        <Button variant="outline" className="mb-3" onPress={() => void openPdf(() => downloadTranscriptPdf(locale), 'transcript.pdf')} isDisabled={isDownloading} testID="training-transcript-pdf">
          <ButtonText>{t('training.transcript.pdf')}</ButtonText>
        </Button>
      ) : null}
      {transcript.length === 0 ? (
        <ZeroState icon={GraduationCap} heading={t('training.transcript.empty')} onRetry={refresh} testID="training-transcript-empty" />
      ) : (
        transcript.map((record) => (
          <RecordRow
            key={record.Id}
            record={record}
            isBusy={isDownloading}
            onCertificate={(item: LearningRecordData) => void openPdf(() => downloadCertificate(item.Id, locale), `certificate-${item.Id}.pdf`)}
            onRespond={(item: LearningRecordData) => pushRoutePath(router, trainingRoutes.submission(item.Id))}
          />
        ))
      )}
    </ScrollView>
  );

  const certificationsTab = (
    <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl} testID="training-certifications">
      {certifications.length === 0 && certificationProgress.length === 0 ? <ZeroState icon={Award} heading={t('training.certifications_empty')} onRetry={refresh} testID="training-certifications-empty" /> : null}
      {certifications.length > 0 ? (
        <Section title={t('training.sections.certifications_due')}>
          {certifications.map((certification) => (
            <CertificationRow key={certification.CertificationId} certification={certification} />
          ))}
        </Section>
      ) : null}
      {lmsOn && certificationProgress.length > 0 ? (
        <Section title={t('training.sections.certification_progress')} testID="training-section-cert-progress">
          {certificationProgress.map((progress) => (
            <CertificationProgressCard key={progress.CertificationTypeId} progress={progress} />
          ))}
        </Section>
      ) : null}
      <Button variant="outline" onPress={() => pushRoutePath(router, certificationsRoutes.list())} testID="training-open-certifications">
        <ButtonText>{t('training.my_certifications')}</ButtonText>
      </Button>
    </ScrollView>
  );

  return (
    <View className="flex-1 bg-background-50" testID="training-screen">
      <SharedTabs
        variant="pills"
        className="flex-1"
        contentClassName="flex-1"
        activeIndex={routeTab.activeIndex}
        onChange={routeTab.selectIndex}
        tabs={[
          { key: 'assigned', title: 'training.tabs.assigned', content: assigned, badge: open.length + openCourses.length || undefined },
          { key: 'available', title: 'training.tabs.available', content: available },
          { key: 'transcript', title: 'training.tabs.transcript', content: records },
          { key: 'certifications', title: 'training.tabs.certifications', content: certificationsTab },
        ]}
      />
    </View>
  );
}

/** The home's tabs, kept in the route (`?tab=transcript`) so Back from a training returns to the same one. */
const HOME_TABS = [{ key: 'assigned' }, { key: 'available' }, { key: 'transcript' }, { key: 'certifications' }];

const styles = StyleSheet.create({
  content: { padding: 12, paddingBottom: 32 },
});
