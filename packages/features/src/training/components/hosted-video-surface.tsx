/* eslint-disable @typescript-eslint/no-require-imports -- expo-video is required lazily: variants without the native module must never load it. */
import { getActiveVariant } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { Text } from '@resgrid/ui';
import type * as ExpoVideo from 'expo-video';
import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';

export interface HostedVideoSurfaceProps {
  /** The signed HLS playlist (or MP4) link. */
  uri: string;
  isHls: boolean;
  /** Where playback resumes (seconds), e.g. after the links were read again. */
  startAt: number;
  onTime: (positionSeconds: number, durationSeconds: number, playing: boolean) => void;
  /** The player failed (an expired signed link among the usual causes): the parent reads the links again. */
  onError: () => void;
}

type ExpoVideoModule = typeof ExpoVideo;

/** expo-video only where the variant links the native module (`native.modules` includes `video`); null elsewhere. */
function loadExpoVideo(): ExpoVideoModule | null {
  try {
    if (!getActiveVariant().native.modules.includes('video')) return null;

    // SAFETY: the module is expo-video itself, loaded lazily only where the variant links it.
    return require('expo-video') as ExpoVideoModule;
  } catch {
    return null;
  }
}

const NativeVideo: React.FC<HostedVideoSurfaceProps & { module: ExpoVideoModule }> = ({ module, uri, isHls, startAt, onTime, onError }) => {
  const callbacks = useRef({ onTime, onError });
  callbacks.current = { onTime, onError };

  const player = module.useVideoPlayer({ uri, contentType: isHls ? 'hls' : 'progressive' }, (instance) => {
    if (startAt > 0) instance.currentTime = startAt;
  });

  useEffect(() => {
    let failed = false;

    const timer = setInterval(() => {
      callbacks.current.onTime(player.currentTime, player.duration, player.playing);

      if (player.status === 'error' && !failed) {
        failed = true;
        callbacks.current.onError();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [player]);

  return <module.VideoView player={player} style={styles.video} nativeControls contentFit="contain" allowsPictureInPicture testID="hosted-video-native" />;
};

/** The hosted lesson video on iOS/Android: the signed HLS stream in expo-video (no bearer token leaves the app with it). */
export const HostedVideoSurface: React.FC<HostedVideoSurfaceProps> = (props) => {
  const { t } = useTranslation();
  const expoVideo = loadExpoVideo();

  if (!expoVideo) {
    return (
      <Text size="sm" className="text-typography-600" testID="hosted-video-unsupported">
        {t('training.hosted_video_web')}
      </Text>
    );
  }

  return <NativeVideo module={expoVideo} {...props} />;
};

const styles = StyleSheet.create({
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000000' },
});
