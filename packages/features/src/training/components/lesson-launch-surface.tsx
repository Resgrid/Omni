import type { LmsLessonData, LmsLessonLaunchData } from '@resgrid/models';
import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest, WebViewHttpErrorEvent, WebViewMessageEvent, WebViewOpenWindowEvent } from 'react-native-webview/lib/WebViewTypes';

import { openInSystemBrowser } from '../lib/launch-browser';
import { isExternalOpenable, isFromLaunchOrigin, isLaunchNavigationAllowed, isLtiLaunch, launchHttpFailure, launchOrigin, type LessonLaunchMessage, parseLessonMessage } from '../lib/lesson-launch';

export interface LessonLaunchSurfaceProps {
  launch: LmsLessonLaunchData;
  /** The launch page's completion message (checked: the page's origin, this lesson, a known status). A hint: read the course again. */
  onMessage: (message: LessonLaunchMessage) => void;
  /** The page did not load: `expired` (410), `RateLimited` (429) or `network`. */
  onFailure: (code: string) => void;
  testID?: string;
}

/** iOS and Android play every launch in the app's own web view (LTI too, with the system browser as the fallback). */
export const canPlayInApp = (_launch: LmsLessonLaunchData): boolean => true;

/** Before asking Core: whether this lesson will play in the app here (always on iOS and Android). */
export const playsLessonInApp = (_lesson: Pick<LmsLessonData, 'Kind'>): boolean => true;

/**
 * The launch page in a native web view (iOS/Android). JavaScript on; Core's origin only, plus the https sites of an LTI tool (its
 * sign-in and content, with its cookies — Resgrid's page sets none); anything else, and every new window a lesson opens (SCORM
 * popups), goes to the system browser. Inline media and fullscreen video. The page reports through `ReactNativeWebView.postMessage`;
 * a message counts only when the page posting it is on the launch's origin.
 */
export const LessonLaunchSurface: React.FC<LessonLaunchSurfaceProps> = ({ launch, onMessage, onFailure, testID = 'lesson-launch-webview' }) => {
  const lti = isLtiLaunch(launch);
  const origin = launchOrigin(launch);
  const originWhitelist = useMemo(() => [...(origin ? [origin] : []), 'about:*', ...(lti ? ['https://*'] : [])], [lti, origin]);

  const shouldStart = (request: ShouldStartLoadRequest): boolean => {
    // Frames inside the page (the sandboxed package) are the page's own business; the top level stays on the launch's sites.
    if (request.isTopFrame === false || isLaunchNavigationAllowed(request.url, launch)) return true;

    if (isExternalOpenable(request.url)) openInSystemBrowser(request.url);

    return false;
  };

  const onOpenWindow = (event: WebViewOpenWindowEvent) => {
    if (isExternalOpenable(event.nativeEvent.targetUrl)) openInSystemBrowser(event.nativeEvent.targetUrl);
  };

  const onWebMessage = (event: WebViewMessageEvent) => {
    if (!isFromLaunchOrigin(event.nativeEvent.url, launch)) return;

    const message = parseLessonMessage(event.nativeEvent.data, launch.CompletionMessage);

    if (message) onMessage(message);
  };

  const onHttpError = (event: WebViewHttpErrorEvent) => {
    const failure = isFromLaunchOrigin(event.nativeEvent.url, launch) ? launchHttpFailure(event.nativeEvent.statusCode) : null;

    if (failure) onFailure(failure);
  };

  return (
    <WebView
      source={{ uri: launch.LaunchUrl }}
      style={styles.fill}
      originWhitelist={originWhitelist}
      onShouldStartLoadWithRequest={shouldStart}
      javaScriptEnabled
      domStorageEnabled
      thirdPartyCookiesEnabled={lti}
      sharedCookiesEnabled={lti}
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
      setSupportMultipleWindows
      javaScriptCanOpenWindowsAutomatically
      onOpenWindow={onOpenWindow}
      onMessage={onWebMessage}
      onHttpError={onHttpError}
      onError={() => onFailure('network')}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      testID={testID}
    />
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
});
