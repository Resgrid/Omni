import { CallVideoFeedFormat, CallVideoFeedStatus, CallVideoFeedType } from '@resgrid/models';

/** Feed format/type/status labels and URL helpers (Unit `feed-format-utils`, values from Core's enums). */
export const FEED_TYPE_LABELS: Record<number, string> = {
  [CallVideoFeedType.Drone]: 'video_feeds.type_drone',
  [CallVideoFeedType.FixedCamera]: 'video_feeds.type_fixed_camera',
  [CallVideoFeedType.BodyCam]: 'video_feeds.type_body_cam',
  [CallVideoFeedType.TrafficCam]: 'video_feeds.type_traffic_cam',
  [CallVideoFeedType.WeatherCam]: 'video_feeds.type_weather_cam',
  [CallVideoFeedType.SatelliteFeed]: 'video_feeds.type_satellite_feed',
  [CallVideoFeedType.WebCam]: 'video_feeds.type_web_cam',
  [CallVideoFeedType.Other]: 'video_feeds.type_other',
};

export const FEED_FORMAT_LABELS: Record<number, string> = {
  [CallVideoFeedFormat.RTSP]: 'video_feeds.format_rtsp',
  [CallVideoFeedFormat.HLS]: 'video_feeds.format_hls',
  [CallVideoFeedFormat.MJPEG]: 'video_feeds.format_mjpeg',
  [CallVideoFeedFormat.YouTubeLive]: 'video_feeds.format_youtube_live',
  [CallVideoFeedFormat.WebRTC]: 'video_feeds.format_webrtc',
  [CallVideoFeedFormat.DASH]: 'video_feeds.format_dash',
  [CallVideoFeedFormat.Embed]: 'video_feeds.format_embed',
  [CallVideoFeedFormat.Other]: 'video_feeds.format_other',
};

export const FEED_STATUS_LABELS: Record<number, string> = {
  [CallVideoFeedStatus.Active]: 'video_feeds.status_active',
  [CallVideoFeedStatus.Inactive]: 'video_feeds.status_inactive',
  [CallVideoFeedStatus.Error]: 'video_feeds.status_error',
};

export const FEED_TYPE_VALUES: readonly number[] = Object.keys(FEED_TYPE_LABELS).map(Number);
export const FEED_FORMAT_VALUES: readonly number[] = Object.keys(FEED_FORMAT_LABELS).map(Number);

/** A format guess from the URL (HLS .m3u8, DASH .mpd, rtsp://, YouTube, MJPEG); null when it says nothing. */
export function detectFeedFormat(url: string): number | null {
  const lower = url.trim().toLowerCase();
  if (lower.includes('.m3u8')) return CallVideoFeedFormat.HLS;
  if (lower.includes('.mpd')) return CallVideoFeedFormat.DASH;
  if (lower.startsWith('rtsp://') || lower.startsWith('rtsps://')) return CallVideoFeedFormat.RTSP;
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return CallVideoFeedFormat.YouTubeLive;
  if (lower.includes('mjpeg') || lower.includes('mjpg')) return CallVideoFeedFormat.MJPEG;
  return null;
}

/** Feed URLs are admin-entered: only http(s) ever loads in a web surface; rtsp(s) is copy-only. */
export const isWebFeedUrl = (url: string): boolean => /^https?:\/\//i.test(url.trim());
export const isAcceptedFeedUrl = (url: string): boolean => /^(https?|rtsps?):\/\/\S+$/i.test(url.trim());

/** How the player shows a feed. */
export type FeedPlayback = 'native-video' | 'embed' | 'page' | 'copy-only' | 'unsupported';

export function feedPlayback(format: number | null, url: string): FeedPlayback {
  switch (format) {
    case CallVideoFeedFormat.HLS:
    case CallVideoFeedFormat.DASH:
      return isWebFeedUrl(url) ? 'native-video' : 'unsupported';
    case CallVideoFeedFormat.YouTubeLive:
    case CallVideoFeedFormat.Embed:
      return isWebFeedUrl(url) ? 'embed' : 'unsupported';
    case CallVideoFeedFormat.RTSP:
      return 'copy-only';
    case CallVideoFeedFormat.WebRTC:
      return 'unsupported';
    default:
      return isWebFeedUrl(url) ? 'page' : 'copy-only';
  }
}
