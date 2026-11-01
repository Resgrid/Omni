/* eslint-disable @typescript-eslint/no-require-imports -- expo-video is required lazily: variants without the native module must never load it. */
import { getActiveVariant } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { CallVideoFeedFormat, type CallVideoFeedResultData } from '@resgrid/models';
import { Text } from '@resgrid/ui';
import type * as ExpoVideo from 'expo-video';
import React from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import { feedPlayback, isWebFeedUrl } from '../lib/feed-format';

export interface VideoFeedSurfaceProps {
  feed: CallVideoFeedResultData;
}

type ExpoVideoModule = typeof ExpoVideo;

/** expo-video only where the variant links the native module (`native.modules` includes `video`); null elsewhere. */
function loadExpoVideo(): ExpoVideoModule | null {
  try {
    if (!getActiveVariant().native.modules.includes('video')) return null;
    return require('expo-video') as ExpoVideoModule;
  } catch {
    return null;
  }
}

const NativeVideo: React.FC<{ module: ExpoVideoModule; uri: string; contentType: 'hls' | 'dash' }> = ({ module, uri, contentType }) => {
  const player = module.useVideoPlayer({ uri, contentType }, (instance) => {
    instance.play();
  });
  return <module.VideoView player={player} style={styles.fill} nativeControls contentFit="contain" testID="video-feed-native-player" />;
};

/**
 * The player surface on iOS/Android (Unit baseline). HLS/DASH play in expo-video (falling back to a page view when
 * the variant has no video module); embeds load https/http only with JavaScript, plain pages without it; RTSP and
 * WebRTC cannot play in-app (the player offers "Copy URL").
 */
export const VideoFeedSurface: React.FC<VideoFeedSurfaceProps> = ({ feed }) => {
  const { t } = useTranslation();
  const playback = feedPlayback(feed.FeedFormat, feed.Url);
  const url = isWebFeedUrl(feed.Url) ? feed.Url.trim() : null;

  if (playback === 'native-video' && url) {
    const expoVideo = loadExpoVideo();
    if (expoVideo) return <NativeVideo key={url} module={expoVideo} uri={url} contentType={feed.FeedFormat === CallVideoFeedFormat.HLS ? 'hls' : 'dash'} />;
  }
  if ((playback === 'embed' || playback === 'page' || playback === 'native-video') && url) {
    return (
      <WebView
        source={{ uri: url }}
        style={styles.fill}
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled={playback !== 'page'}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        testID="video-feed-webview"
      />
    );
  }
  return (
    <Text className="p-8 text-center text-typography-0" testID="video-feed-unsupported">
      {playback === 'copy-only' ? t('video_feeds.rtsp_not_supported') : t('video_feeds.webrtc_not_supported')}
    </Text>
  );
};

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
});
