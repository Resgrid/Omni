import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, CustomBottomSheet, HStack, Pressable, Spinner, Text, View, VStack } from '@resgrid/ui';
import { type AudioStream, useAudioStreamStore } from '@resgrid/voice';
import { Check, Volume2, VolumeX } from 'lucide-react-native';
import React, { useCallback, useEffect } from 'react';

export interface AudioStreamSheetProps {
  testID?: string;
}

const close = (): void => useAudioStreamStore.getState().setIsBottomSheetVisible(false);

/** "None" in the stream list: stops what is playing. */
const NONE_ID = 'none';

/**
 * The department's audio (scanner) streams (legacy Unit/Responder/IC/Dispatch `AudioStreamBottomSheet`), opened from
 * anywhere by `useAudioStreamStore.setIsBottomSheetVisible(true)` — Unit's sidebar radio button — and mounted once by the
 * shell as an overlay. One stream plays at a time (expo-audio on iOS/Android, an audio element on web and Electron);
 * picking "None" stops it. The stream keeps playing after the sheet closes.
 */
export const AudioStreamSheet: React.FC<AudioStreamSheetProps> = ({ testID = 'audio-stream-sheet' }) => {
  const { t } = useTranslation();
  const isOpen = useAudioStreamStore((state) => state.isBottomSheetVisible);
  const streams = useAudioStreamStore((state) => state.availableStreams);
  const currentStream = useAudioStreamStore((state) => state.currentStream);
  const isLoadingStreams = useAudioStreamStore((state) => state.isLoadingStreams);
  const isPlaying = useAudioStreamStore((state) => state.isPlaying);
  const isLoading = useAudioStreamStore((state) => state.isLoading);
  const isBuffering = useAudioStreamStore((state) => state.isBuffering);
  const isReconnecting = useAudioStreamStore((state) => state.isReconnecting);

  useEffect(() => {
    if (isOpen && useAudioStreamStore.getState().availableStreams.length === 0) void useAudioStreamStore.getState().fetchAvailableStreams();
  }, [isOpen]);

  const isBusy = isLoading || isBuffering;

  // While a stream loads or buffers only "None" stays available: a stalled stream can always be stopped (stopStream
  // supersedes a pending play), and starting another waits for this one to settle. A stream that is reconnecting can be
  // swapped for another at once.
  const select = useCallback(
    (stream: AudioStream | null) => {
      if (stream !== null && isBusy && !isReconnecting) return;
      const store = useAudioStreamStore.getState();

      if (stream === null) void store.stopStream();
      else if (store.currentStream?.Id !== stream.Id) void store.playStream(stream);
    },
    [isBusy, isReconnecting]
  );

  const statusLine = isLoading
    ? t('audio_streams.loading_stream')
    : isReconnecting && currentStream
      ? t('audio_streams.reconnecting_stream', { streamName: currentStream.Name })
      : isBuffering
        ? t('audio_streams.buffering_stream')
        : currentStream
          ? isPlaying
            ? t('audio_streams.currently_playing', { streamName: currentStream.Name })
            : t('audio_streams.stream_selected', { streamName: currentStream.Name })
          : t('audio_streams.no_stream_playing');

  // A stream paused from the lock screen / notification keeps its place: Paused, not Stopped.
  const playback = isReconnecting
    ? { label: t('audio_streams.reconnecting'), className: 'text-warning-600' }
    : isBusy
      ? { label: isLoading ? t('audio_streams.loading') : t('audio_streams.buffering'), className: 'text-primary-600' }
      : isPlaying
        ? { label: t('audio_streams.playing'), className: 'text-success-600' }
        : currentStream
          ? { label: t('audio_streams.paused'), className: 'text-warning-600' }
          : { label: t('audio_streams.stopped'), className: 'text-error-600' };

  const rows: { id: string; name: string; stream: AudioStream | null }[] = [{ id: NONE_ID, name: t('audio_streams.none'), stream: null }, ...streams.map((stream) => ({ id: stream.Id, name: stream.Name, stream }))];
  const selectedId = currentStream?.Id ?? NONE_ID;

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={close} snapPoints={[70]} testID={testID}>
      <VStack space="sm" className="items-center">
        <View>{isBusy ? <Spinner size="large" /> : currentStream && isPlaying ? <Volume2 size={32} color="#16a34a" /> : <VolumeX size={32} color="#9ca3af" />}</View>
        <Text className="text-center text-lg font-semibold text-typography-900" accessibilityRole="header">
          {t('audio_streams.title')}
        </Text>
        <Text className="text-center text-sm text-typography-500" testID={`${testID}-status`}>
          {statusLine}
        </Text>
      </VStack>

      <VStack space="xs" accessibilityRole="radiogroup" accessibilityLabel={t('audio_streams.select_stream')}>
        <Text className="font-medium text-typography-900">{t('audio_streams.select_stream')}</Text>
        {isLoadingStreams ? (
          <HStack space="sm" className="items-center justify-center p-4" testID={`${testID}-loading`}>
            <Spinner size="small" />
            <Text className="text-sm text-typography-500">{t('audio_streams.loading_streams')}</Text>
          </HStack>
        ) : (
          rows.map((row) => {
            const isSelected = row.id === selectedId;
            const isDisabled = isBusy && !isReconnecting && row.stream !== null;

            return (
              <Pressable
                key={row.id}
                onPress={() => select(row.stream)}
                disabled={isDisabled}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected, disabled: isDisabled }}
                accessibilityLabel={row.name}
                testID={`${testID}-stream-${row.id}`}
                className={`rounded-lg border px-3 py-3 ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-outline-200 bg-background-0'}`}
              >
                <HStack space="md" className="items-center">
                  <Text className={`flex-1 text-typography-900 ${isSelected ? 'font-semibold' : ''}`} numberOfLines={1}>
                    {row.name}
                  </Text>
                  {isSelected ? (
                    <View>
                      <Check size={20} color="#2563eb" />
                    </View>
                  ) : null}
                </HStack>
              </Pressable>
            );
          })
        )}
      </VStack>

      {currentStream ? (
        <VStack space="xs" className="rounded-lg bg-background-50 p-3" testID={`${testID}-info`}>
          <Text className="font-medium text-typography-900">{t('audio_streams.stream_info')}</Text>
          <HStack space="sm" className="items-center">
            <Text className="flex-1 text-sm text-typography-500">{t('audio_streams.name')}</Text>
            <Text className="text-sm font-medium text-typography-900">{currentStream.Name}</Text>
          </HStack>
          <HStack space="sm" className="items-center">
            <Text className="flex-1 text-sm text-typography-500">{t('audio_streams.type')}</Text>
            <Text className="text-sm font-medium text-typography-900">{currentStream.Type || t('common.unknown')}</Text>
          </HStack>
          <HStack space="sm" className="items-center">
            <Text className="flex-1 text-sm text-typography-500">{t('audio_streams.status')}</Text>
            <Text className={`text-sm font-medium ${playback.className}`} testID={`${testID}-playback`}>
              {playback.label}
            </Text>
          </HStack>
        </VStack>
      ) : null}

      <VStack space="sm">
        {!isLoadingStreams && streams.length === 0 ? (
          <Button variant="outline" onPress={() => void useAudioStreamStore.getState().fetchAvailableStreams({ forceRefresh: true })} testID={`${testID}-refresh`}>
            <ButtonText>{t('audio_streams.refresh_streams')}</ButtonText>
          </Button>
        ) : null}
        <Button variant="outline" onPress={close} testID={`${testID}-close`}>
          <ButtonText>{t('common.close')}</ButtonText>
        </Button>
      </VStack>
    </CustomBottomSheet>
  );
};
