import { useTranslation } from '@resgrid/i18n';
import type { LmsLessonData, LmsLessonLaunchData } from '@resgrid/models';
import React, { useEffect, useRef } from 'react';

import { frameMessage, isLtiLaunch, isLtiLesson, launchOrigin, type LessonLaunchMessage, originOf } from '../lib/lesson-launch';

export interface LessonLaunchSurfaceProps {
  launch: LmsLessonLaunchData;
  /** The launch page's completion message (checked: the frame's origin and window, this lesson, a known status). A hint only. */
  onMessage: (message: LessonLaunchMessage) => void;
  /** The page did not load (web cannot see the status; the page itself reports a used or expired link). */
  onFailure: (code: string) => void;
  testID?: string;
}

/**
 * The launch page's frame: scripts, its own origin (Core's site, never this app's), forms, popups, dialogs and downloads, as Core's
 * page needs; the package itself runs sandboxed again inside it.
 */
export const LESSON_LAUNCH_IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads';

const appOrigin = (): string | null => (typeof window !== 'undefined' && window.location ? originOf(window.location.href) : null);

/**
 * Web and Electron frame SCORM and cmi5 packages. An LTI tool opens in its own top-level window instead (tools refuse to be framed and
 * their cookies would be third-party here), and so does any launch served from this app's own origin: `allow-same-origin` must
 * never give a framed page this app's origin.
 */
export const canPlayInApp = (launch: LmsLessonLaunchData): boolean => {
  const origin = launchOrigin(launch);

  return !isLtiLaunch(launch) && origin !== null && origin !== appOrigin();
};

/** Before asking Core: an LTI lesson opens in a window of its own here (the window is prepared while the tap still counts). */
export const playsLessonInApp = (lesson: Pick<LmsLessonData, 'Kind'>): boolean => !isLtiLesson(lesson);

/**
 * The launch page in a sandboxed iframe (web and Electron). Core frames it only for the app origins in its
 * `LmsStandardsConfig.AppFrameOrigins` and posts its completion message to those origins only; a message counts only when it comes
 * from this frame's window on the launch's origin.
 */
export const LessonLaunchSurface: React.FC<LessonLaunchSurfaceProps> = ({ launch, onMessage, testID = 'lesson-launch-iframe' }) => {
  const { t } = useTranslation();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const report = useRef(onMessage);

  report.current = onMessage;

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const fromLaunchFrame = frame.current !== null && event.source === frame.current.contentWindow;
      const message = frameMessage(event.origin, fromLaunchFrame, JSON.stringify(event.data) ?? '', launch);

      if (message) report.current(message);
    };

    window.addEventListener('message', listener);

    return () => window.removeEventListener('message', listener);
  }, [launch]);

  return (
    <iframe
      ref={frame}
      src={launch.LaunchUrl}
      title={t('training.launch.player_title')}
      style={fill}
      sandbox={LESSON_LAUNCH_IFRAME_SANDBOX}
      allow="fullscreen; autoplay"
      allowFullScreen
      referrerPolicy="no-referrer"
      data-testid={testID}
    />
  );
};

const fill: React.CSSProperties = { flex: 1, width: '100%', height: '100%', border: 0, backgroundColor: '#ffffff' };
