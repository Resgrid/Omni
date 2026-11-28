import { fetchSignedCaptions, useTrainingStore } from '@resgrid/data';
import { OptionChips } from '@resgrid/features/calls/components/option-chips';
import { useTranslation } from '@resgrid/i18n';
import type { LmsCaptionTrackData, LmsLessonPlaylistData } from '@resgrid/models';
import { Button, ButtonText, Spinner, Text, VStack } from '@resgrid/ui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { lmsErrorKey } from '../lib/training-format';
import { type CaptionCue, cueAt, isPlaylistExpired, parseWebVtt, playlistRefreshDelay } from '../lib/webvtt';
import { HostedVideoSurface } from './hosted-video-surface';

export interface HostedVideoPlayerProps {
  enrollmentId: number;
  lessonId: number;
  /** The lesson's caption tracks (an Academy track carries its own https link; uploaded ones come signed with the playlist). */
  lessonCaptions: readonly LmsCaptionTrackData[];
  /** Where the member left off (seconds). */
  resumeAt: number;
  onProgress: (positionSeconds: number, durationSeconds: number) => void;
}

/** Re-reading the links after the player fails stops here, so a lesson whose media is really gone does not loop. */
const MAX_RELOADS = 3;

const OFF = 'off';

/** The caption tracks to offer: the signed ones from the playlist, then the lesson's own https tracks for locales not covered. */
export function captionTracks(playlist: readonly LmsCaptionTrackData[] | null | undefined, lesson: readonly LmsCaptionTrackData[]): LmsCaptionTrackData[] {
  const tracks = (playlist ?? []).filter((track) => !!track.Url && !!track.Locale);
  const locales = new Set(tracks.map((track) => track.Locale));

  return [...tracks, ...lesson.filter((track) => !!track.Url && /^https:\/\//i.test(track.Url) && !!track.Locale && !locales.has(track.Locale))];
}

/** The track in the app's language (by its two-letter code), else none: captions start off unless they match the reader. */
export const preferredTrack = (tracks: readonly LmsCaptionTrackData[], language: string | undefined): string => {
  const code = (language ?? '').slice(0, 2).toLowerCase();

  return tracks.find((track) => (track.Locale ?? '').slice(0, 2).toLowerCase() === code)?.Locale ?? OFF;
};

/**
 * The captions shown: the member's own choice while it is still offered (Off included, so a refreshed playlist never turns captions
 * back on), else the track in the app's language. `chosen` is null until the member picks.
 */
export const shownTrack = (tracks: readonly LmsCaptionTrackData[], chosen: string | null, language: string | undefined): string =>
  chosen !== null && (chosen === OFF || tracks.some((track) => track.Locale === chosen)) ? chosen : preferredTrack(tracks, language);

/**
 * A hosted lesson video in the app (LMS): the signed HLS stream (MP4 on web, where browsers other than Safari do not play HLS)
 * from `Lms/GetLessonPlaylist`, with its WebVTT captions shown under the picture in the chosen language. The signed links stop at
 * UrlExpiresOn: they are read again once expired while the video is not playing, and whenever the player fails (playback
 * resumes where it was).
 */
export const HostedVideoPlayer: React.FC<HostedVideoPlayerProps> = ({ enrollmentId, lessonId, lessonCaptions, resumeAt, onProgress }) => {
  const { t, i18n } = useTranslation();
  const [playlist, setPlaylist] = useState<LmsLessonPlaylistData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [generation, setGeneration] = useState(0);
  const [position, setPosition] = useState(resumeAt);
  const [chosenTrack, setChosenTrack] = useState<string | null>(null);
  const [cues, setCues] = useState<CaptionCue[]>([]);
  const positionRef = useRef(resumeAt);
  const playingRef = useRef(false);
  const expiredRef = useRef(false);
  const reloadsRef = useRef(0);

  const load = useCallback(async () => {
    setIsLoading(true);
    expiredRef.current = false;
    const outcome = await useTrainingStore.getState().getLessonPlaylist(enrollmentId, lessonId);
    const data = outcome.value?.Data ?? null;

    setPlaylist(data);
    setError(data ? null : (outcome.error ?? 'MediaUnavailable'));
    setGeneration((current) => current + 1);
    setIsLoading(false);
  }, [enrollmentId, lessonId]);

  useEffect(() => {
    reloadsRef.current = 0;
    void load();
  }, [load]);

  // The links run out at UrlExpiresOn: read them again then, or as soon as the video stops if it is playing.
  useEffect(() => {
    if (!playlist) return undefined;

    const timer = setTimeout(() => {
      if (playingRef.current) expiredRef.current = true;
      else void load();
    }, playlistRefreshDelay(playlist.UrlExpiresOn));

    return () => clearTimeout(timer);
  }, [load, playlist]);

  const tracks = useMemo(() => captionTracks(playlist?.Captions, lessonCaptions), [lessonCaptions, playlist?.Captions]);
  const trackLocale = shownTrack(tracks, chosenTrack, i18n?.language);

  const trackUrl = tracks.find((track) => track.Locale === trackLocale)?.Url ?? null;

  useEffect(() => {
    let current = true;
    setCues([]);

    if (trackUrl)
      fetchSignedCaptions(trackUrl)
        .then((text) => {
          if (current) setCues(parseWebVtt(text));
        })
        .catch(() => undefined);

    return () => {
      current = false;
    };
  }, [trackUrl]);

  const onTime = useCallback(
    (seconds: number, duration: number, playing: boolean) => {
      positionRef.current = seconds;
      playingRef.current = playing;
      setPosition(seconds);
      onProgress(seconds, duration || playlist?.DurationSeconds || 0);

      if (!playing && expiredRef.current) void load();
    },
    [load, onProgress, playlist?.DurationSeconds]
  );

  const onError = useCallback(() => {
    if (reloadsRef.current >= MAX_RELOADS) {
      setError('MediaUnavailable');

      return;
    }

    reloadsRef.current += 1;
    void load();
  }, [load]);

  if (isLoading && !playlist) return <Spinner testID="hosted-video-loading" />;

  const uri = playlist ? (Platform.OS === 'web' ? (playlist.Mp4Url ?? playlist.PlaylistUrl) : (playlist.PlaylistUrl ?? playlist.Mp4Url)) : null;

  if (!playlist || !uri || error) {
    return (
      <VStack space="sm" testID="hosted-video-error">
        <Text size="sm" className="text-typography-600">
          {t(lmsErrorKey(error))}
        </Text>
        <Button size="sm" variant="outline" className="self-start" onPress={() => void load()} testID="hosted-video-retry">
          <ButtonText>{t('common.retry')}</ButtonText>
        </Button>
      </VStack>
    );
  }

  const cue = trackLocale === OFF ? null : cueAt(cues, position);

  return (
    <VStack space="sm" testID="hosted-video">
      <HostedVideoSurface key={generation} uri={uri} isHls={uri === playlist.PlaylistUrl} startAt={positionRef.current} onTime={onTime} onError={onError} />
      {tracks.length > 0 ? (
        <OptionChips
          options={[{ value: OFF, label: t('training.captions_off') }, ...tracks.map((track) => ({ value: track.Locale ?? '', label: track.Label || (track.Locale ?? '') }))]}
          selected={[trackLocale]}
          onToggle={(value) => setChosenTrack(value)}
          scroll
          accessibilityLabel={t('training.captions')}
          testID="hosted-video-captions"
        />
      ) : null}
      {cue ? (
        <Text className="rounded-md bg-background-900 p-2 text-center text-typography-0" accessibilityLiveRegion="polite" testID="hosted-video-cue">
          {cue.text}
        </Text>
      ) : null}
      {isPlaylistExpired(playlist.UrlExpiresOn) && !playingRef.current ? <Spinner testID="hosted-video-refreshing" /> : null}
    </VStack>
  );
};
