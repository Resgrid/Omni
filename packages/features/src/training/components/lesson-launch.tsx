import { useNetInfo } from '@react-native-community/netinfo';
import { useTrainingStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { LmsLessonData, LmsLessonLaunchData } from '@resgrid/models';
import { isNetInfoOnline } from '@resgrid/offline';
import { Button, ButtonSpinner, ButtonText, HStack, ScreenHeader, Text, useThemeColors, View, VStack } from '@resgrid/ui';
import { MonitorPlay } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { type LaunchBrowser, prepareLaunchBrowser } from '../lib/launch-browser';
import { isLtiLaunch, isLtiLesson, isResultMessage, isTrustedLaunch, launchErrorKey, type LessonLaunchMessage } from '../lib/lesson-launch';
import { canPlayInApp, LessonLaunchSurface, playsLessonInApp } from './lesson-launch-surface';

/** Where a launch stands: not started, asking Core, playing in the app, open in a browser, or refused. */
export type LessonLaunchState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'playing'; launch: LmsLessonLaunchData } | { kind: 'elsewhere' } | { kind: 'error'; code: string };

export interface LessonLaunchControls {
  state: LessonLaunchState;
  /** The last result the page reported (a hint until the course is read again). */
  lastMessage: LessonLaunchMessage | null;
  isOnline: boolean;
  /** Asks Core for a launch and opens it at once: in the app's player, or in the browser when `viaBrowser` or this platform needs it. */
  start: (viaBrowser?: boolean) => Promise<void>;
  /** The member is finished: back to the lesson, and the course is read again. */
  done: () => void;
  onMessage: (message: LessonLaunchMessage) => void;
  onFailure: (code: string) => void;
}

/**
 * One SCORM, cmi5 or LTI lesson's launch (round 10 A8). Online only: the connection is checked before Core is asked. The link is
 * opened the moment it arrives and lives only in this state while the player shows it (never stored or logged). The page's message
 * and every way out (Done, the browser closing, coming back to the app) read the course again: GetCourse is the record.
 */
export function useLessonLaunch(enrollmentId: number | null, lesson: Pick<LmsLessonData, 'LessonId' | 'Kind'> | null, refresh: () => Promise<void>): LessonLaunchControls {
  const isOnline = isNetInfoOnline(useNetInfo());
  const [state, setState] = useState<LessonLaunchState>({ kind: 'idle' });
  const [lastMessage, setLastMessage] = useState<LessonLaunchMessage | null>(null);
  const reload = useRef(refresh);
  const current = useRef(state);

  reload.current = refresh;
  current.current = state;

  // A new lesson starts fresh.
  useEffect(() => {
    setState({ kind: 'idle' });
    setLastMessage(null);
  }, [lesson?.LessonId]);

  // Back from the browser (an LTI tool, or the web's window): read the course again.
  useEffect(() => {
    if (state.kind !== 'elsewhere') return undefined;

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void reload.current();
    });

    return () => subscription.remove();
  }, [state.kind]);

  const start = useCallback(
    async (viaBrowser = false) => {
      if (!enrollmentId || !lesson) return;

      // A browser window must open while the tap still counts (web), so it is prepared before anything is awaited.
      const browser: LaunchBrowser | null = viaBrowser || !playsLessonInApp(lesson) ? prepareLaunchBrowser() : null;

      if (!isOnline) {
        browser?.discard();
        setState({ kind: 'error', code: 'offline' });

        return;
      }

      setState({ kind: 'loading' });
      setLastMessage(null);

      const result = await useTrainingStore.getState().getLessonLaunch(enrollmentId, lesson.LessonId);
      const launch = result.value;

      if (!launch || !isTrustedLaunch(launch)) {
        browser?.discard();
        setState({ kind: 'error', code: result.error ?? 'MediaUnavailable' });

        return;
      }

      if (!browser && canPlayInApp(launch)) {
        setState({ kind: 'playing', launch });

        return;
      }

      const opened = await (browser ?? prepareLaunchBrowser()).open(launch.LaunchUrl);

      if (opened === 'failed') {
        setState({ kind: 'error', code: 'MediaUnavailable' });

        return;
      }

      if (opened === 'closed') {
        setState({ kind: 'idle' });
        await reload.current();

        return;
      }

      setState({ kind: 'elsewhere' });
    },
    [enrollmentId, isOnline, lesson]
  );

  const done = useCallback(() => {
    setState({ kind: 'idle' });
    void reload.current();
  }, []);

  const onMessage = useCallback((message: LessonLaunchMessage) => {
    setLastMessage(message);

    if (message.status === 'unavailable') {
      // The page refused or ended the lesson (seat, lapse window, a used link): say why, back on the lesson.
      setState({ kind: 'error', code: message.error ?? 'MediaUnavailable' });
      void reload.current();

      return;
    }

    const playing = current.current;

    if (playing.kind === 'playing' && isResultMessage(message, playing.launch.CompletionMessage)) void reload.current();
  }, []);

  const onFailure = useCallback((code: string) => {
    setState({ kind: 'error', code });
    void reload.current();
  }, []);

  return { state, lastMessage, isOnline, start, done, onMessage, onFailure };
}

/** What the player's status line says, from the course as read again (the message alone is only a hint). */
function statusKey(lesson: Pick<LmsLessonData, 'Progress'>, message: LessonLaunchMessage | null): string | null {
  if (lesson.Progress === 'Completed') return 'training.launch.status_completed';

  return message?.status === 'failed' ? 'training.launch.status_failed' : null;
}

export interface LessonLaunchPanelProps {
  lesson: LmsLessonData;
  controls: LessonLaunchControls;
  /** False while the course is read-only (no seat, the lapse window ended) or the LMS is not this member's: no launch then. */
  canLaunch: boolean;
  /** Why the course cannot run (an `LmsErrors` name from GetCourse), shown instead of the start button. */
  refusal: string | null;
}

/** The lesson card for a SCORM, cmi5 or LTI lesson: what it is, start or continue, offline and refusal notes, and Done for a browser launch. */
export const LessonLaunchPanel: React.FC<LessonLaunchPanelProps> = ({ lesson, controls, canLaunch, refusal }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { state, isOnline } = controls;
  const status = statusKey(lesson, controls.lastMessage);
  const completed = lesson.Progress === 'Completed';

  if (!canLaunch || refusal) {
    return (
      <Text size="sm" className="text-typography-600" testID="course-launch-refused">
        {t(refusal ? launchErrorKey(refusal) : 'training.errors.not_available')}
      </Text>
    );
  }

  return (
    <VStack space="sm" testID="course-launch">
      <HStack space="sm" className="items-center">
        <View>
          <MonitorPlay size={18} color={colors.icon} />
        </View>
        <Text size="sm" className="flex-1 text-typography-700">
          {t(isLtiLesson(lesson) ? 'training.launch.hint_lti' : 'training.launch.hint_package')}
        </Text>
      </HStack>
      {status ? (
        <Text size="sm" className={completed ? 'text-success-700' : 'text-typography-700'} testID="course-launch-status">
          {t(status)}
        </Text>
      ) : null}
      {!isOnline ? (
        <Text size="sm" className="text-warning-700" testID="course-launch-offline">
          {t('training.launch.offline')}
        </Text>
      ) : null}
      {state.kind === 'error' && state.code !== 'offline' ? (
        <Text size="sm" className="text-error-600" accessibilityRole="alert" testID="course-launch-error">
          {t(launchErrorKey(state.code))}
        </Text>
      ) : null}
      {state.kind === 'elsewhere' ? (
        <VStack space="sm" testID="course-launch-elsewhere">
          <Text size="sm" className="text-typography-700">
            {t('training.launch.opened_elsewhere')}
          </Text>
          <Button onPress={controls.done} testID="course-launch-done">
            <ButtonText>{t('training.launch.done')}</ButtonText>
          </Button>
        </VStack>
      ) : (
        <Button onPress={() => void controls.start()} isDisabled={!isOnline || state.kind === 'loading' || lesson.IsLocked} testID="course-launch-start">
          {state.kind === 'loading' ? <ButtonSpinner color={colors.textInverse} /> : <ButtonText>{t(lesson.Progress === 'NotStarted' ? 'training.launch.start' : 'training.launch.continue')}</ButtonText>}
        </Button>
      )}
    </VStack>
  );
};

export interface LessonLaunchPlayerProps {
  lesson: LmsLessonData;
  launch: LmsLessonLaunchData;
  controls: LessonLaunchControls;
}

/**
 * The lesson playing in the app, full screen: the launch page, its status as the course reads it, Done (tools often ignore their
 * return link, so the app always has its own way out) and, for an LTI tool, "Open in browser" — a fresh launch in the system
 * browser for tools that refuse the embedded view or its sign-in.
 */
export const LessonLaunchPlayer: React.FC<LessonLaunchPlayerProps> = ({ lesson, launch, controls }) => {
  const { t } = useTranslation();
  const status = statusKey(lesson, controls.lastMessage);

  const actions = (
    <HStack space="sm" className="items-center">
      {isLtiLaunch(launch) ? (
        <Button size="sm" variant="outline" onPress={() => void controls.start(true)} testID="lesson-launch-browser">
          <ButtonText>{t('training.launch.open_in_browser')}</ButtonText>
        </Button>
      ) : null}
      <Button size="sm" onPress={controls.done} testID="lesson-launch-done">
        <ButtonText>{t('training.launch.done')}</ButtonText>
      </Button>
    </HStack>
  );

  return (
    <View className="flex-1 bg-background-0" testID="lesson-launch-player">
      <ScreenHeader title={lesson.Title ?? t('training.launch.player_title')} onBack={controls.done} right={actions} />
      {status ? (
        <Text size="sm" className={`px-4 py-1 ${lesson.Progress === 'Completed' ? 'text-success-700' : 'text-typography-700'}`} testID="lesson-launch-status">
          {t(status)}
        </Text>
      ) : null}
      <LessonLaunchSurface launch={launch} onMessage={controls.onMessage} onFailure={controls.onFailure} />
    </View>
  );
};
