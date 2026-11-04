import { formatUtcInDepartmentTime } from '@resgrid/core/utils/dates';
import { useCallDetailStore } from '@resgrid/data';
import { useDepartmentTimeZone } from '@resgrid/features/department-config';
import { useTranslation } from '@resgrid/i18n';
import type { CallFileResultData } from '@resgrid/models';
import { Pressable, Spinner, Text, useThemeColors, useToast } from '@resgrid/ui';
import { Music, Pause, Play } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { type AudioClipHandle, useCallFormHookPoints } from '../hook-points';
import { getCallFileUrl } from '../lib/call-file-url';
import { CallModalFrame } from './call-modal-frame';

export interface CallAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  callId: string;
}

/**
 * The call's audio recordings (Dispatch call audio modal): one plays at a time, tapping it again stops it, and closing
 * the sheet stops playback. Playback is the app's `playAudioClip` hook point; without it a recording opens in the
 * platform's player. Recording URLs follow the call attachment scheme rules.
 */
export const CallAudioModal: React.FC<CallAudioModalProps> = ({ isOpen, onClose, callId }) => {
  const { t } = useTranslation();
  const timeZone = useDepartmentTimeZone();
  const toast = useToast();
  const colors = useThemeColors();
  const { playAudioClip } = useCallFormHookPoints();
  const audio = useCallDetailStore((state) => state.details[callId]?.audio ?? null);
  const isLoading = useCallDetailStore((state) => state.loading.audio === true);
  const fetchCallAudio = useCallDetailStore((state) => state.fetchCallAudio);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const clip = useRef<AudioClipHandle | null>(null);
  // Bumped on every tap so a slow start that was superseded never takes over playback.
  const request = useRef(0);

  const stop = useCallback(() => {
    clip.current?.stop();
    clip.current = null;
    setPlayingId(null);
  }, []);

  // Closing also supersedes a clip still starting, so it cannot begin playing after the sheet is gone.
  const cancel = useCallback(() => {
    request.current += 1;
    setLoadingId(null);
    stop();
  }, [stop]);

  useEffect(() => {
    if (isOpen) void fetchCallAudio(callId);
    else cancel();
  }, [callId, cancel, fetchCallAudio, isOpen]);

  useEffect(() => () => cancel(), [cancel]);

  const toggle = async (file: CallFileResultData) => {
    const current = ++request.current;

    if (playingId === file.Id) {
      stop();

      return;
    }

    const url = getCallFileUrl(file.Url);

    if (!url) {
      toast.error(t('call_detail.audio_play_error'));

      return;
    }

    stop();

    if (!playAudioClip) {
      Linking.openURL(url).catch(() => toast.error(t('call_detail.audio_play_error')));

      return;
    }

    setLoadingId(file.Id);

    try {
      const handle = await playAudioClip(url, () => {
        if (clip.current === handle) stop();
      });

      if (current !== request.current) {
        handle.stop();

        return;
      }

      clip.current = handle;
      setPlayingId(file.Id);
    } catch {
      toast.error(t('call_detail.audio_play_error'));
    } finally {
      if (current === request.current) setLoadingId(null);
    }
  };

  return (
    <CallModalFrame isOpen={isOpen} onClose={onClose} title={t('call_detail.audio')} testID="call-audio-modal">
      <View style={styles.panel}>
        {isLoading && audio === null ? <Spinner /> : null}
        {(audio ?? []).map((file) => {
          const isPlaying = playingId === file.Id;
          const label = file.Name || file.FileName;

          return (
            <Pressable
              key={file.Id}
              onPress={() => void toggle(file)}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? t('call_detail.audio_stop', { name: label }) : t('call_detail.audio_play', { name: label })}
              style={styles.row}
              className="border-outline-100"
              testID={`call-audio-${file.Id}`}
            >
              <View style={styles.icon}>{loadingId === file.Id ? <Spinner size="small" /> : isPlaying ? <Pause size={20} color={colors.primary} /> : <Play size={20} color={colors.primary} />}</View>
              <View style={styles.body}>
                <Text className="text-typography-900">{label}</Text>
                <Text size="xs" className="text-typography-500">
                  {formatUtcInDepartmentTime(file.Timestamp, timeZone)}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {audio !== null && audio.length === 0 ? (
          <View style={styles.empty}>
            <Music size={32} color={colors.textSubtle} />
            <Text className="mt-2 text-center text-typography-500">{t('call_detail.audio_empty')}</Text>
          </View>
        ) : null}
      </View>
    </CallModalFrame>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingVertical: 10 },
  icon: { width: 32, alignItems: 'center', marginRight: 8 },
  body: { flex: 1 },
  empty: { alignItems: 'center', paddingVertical: 24 },
});
