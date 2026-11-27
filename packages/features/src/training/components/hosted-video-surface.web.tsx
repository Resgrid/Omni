import React from 'react';

export interface HostedVideoSurfaceProps {
  /** The signed MP4 (or HLS playlist, which only Safari plays natively) link. */
  uri: string;
  isHls: boolean;
  /** Where playback resumes (seconds), e.g. after the links were read again. */
  startAt: number;
  onTime: (positionSeconds: number, durationSeconds: number, playing: boolean) => void;
  /** The player failed (an expired signed link among the usual causes): the parent reads the links again. */
  onError: () => void;
}

const fill: React.CSSProperties = { width: '100%', aspectRatio: '16 / 9', backgroundColor: '#000000', border: 0 };

/** The hosted lesson video on web and Electron: the browser's <video> on the signed link (no bearer token, no cookies). */
export const HostedVideoSurface: React.FC<HostedVideoSurfaceProps> = ({ uri, startAt, onTime, onError }) => (
  <video
    src={uri}
    style={fill}
    controls
    playsInline
    crossOrigin="anonymous"
    onLoadedMetadata={(event) => {
      if (startAt > 0) event.currentTarget.currentTime = startAt;
    }}
    onTimeUpdate={(event) => onTime(event.currentTarget.currentTime, event.currentTarget.duration || 0, !event.currentTarget.paused)}
    onPause={(event) => onTime(event.currentTarget.currentTime, event.currentTarget.duration || 0, false)}
    onError={onError}
    data-testid="hosted-video-html"
  />
);
