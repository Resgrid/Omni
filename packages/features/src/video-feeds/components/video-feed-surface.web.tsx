import { useTranslation } from '@resgrid/i18n';
import type { CallVideoFeedResultData } from '@resgrid/models';
import { Text } from '@resgrid/ui';
import React from 'react';

import { feedPlayback, isWebFeedUrl } from '../lib/feed-format';

export interface VideoFeedSurfaceProps {
  feed: CallVideoFeedResultData;
}

/**
 * Embeds run in an iframe without `allow-same-origin`: the feed page gets an opaque origin and can never read the
 * app's storage or tokens (same rule as HtmlRenderer).
 */
export const VIDEO_FEED_IFRAME_SANDBOX = 'allow-scripts allow-presentation';

const fill: React.CSSProperties = { width: '100%', height: '100%', border: 0, backgroundColor: '#000000' };

/**
 * The player surface on web and Electron. HLS/DASH use the browser's <video> (native HLS in Safari/Electron builds
 * that support it); embeds and pages load in a sandboxed iframe; RTSP and WebRTC cannot play in a browser.
 */
export const VideoFeedSurface: React.FC<VideoFeedSurfaceProps> = ({ feed }) => {
  const { t } = useTranslation();
  const playback = feedPlayback(feed.FeedFormat, feed.Url);
  const url = isWebFeedUrl(feed.Url) ? feed.Url.trim() : null;

  if (playback === 'native-video' && url) {
    return <video src={url} style={fill} controls autoPlay muted playsInline data-testid="video-feed-html-video" />;
  }
  if ((playback === 'embed' || playback === 'page') && url) {
    return (
      <iframe
        src={url}
        title={feed.Name}
        style={fill}
        sandbox={playback === 'embed' ? VIDEO_FEED_IFRAME_SANDBOX : ''}
        allow="autoplay; fullscreen; picture-in-picture"
        referrerPolicy="no-referrer"
        data-testid="video-feed-iframe"
      />
    );
  }
  return (
    <Text className="p-8 text-center text-typography-0" testID="video-feed-unsupported">
      {playback === 'copy-only' ? t('video_feeds.rtsp_not_supported') : t('video_feeds.webrtc_not_supported')}
    </Text>
  );
};
