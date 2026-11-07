import { useCapability } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, CustomBottomSheet, HStack, Pressable, Spinner, Text, useToast, View, VStack } from '@resgrid/ui';
import { useBluetoothAudioStore, useLiveKitStore, usePtt, type VoiceChannel } from '@resgrid/voice';
import { type Href, router } from 'expo-router';
import { Mic, MicOff, PhoneOff, Settings } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

export interface VoiceChannelSheetProps {
  testID?: string;
}

const close = (): void => useLiveKitStore.getState().setIsBottomSheetVisible(false);

/**
 * The department's push-to-talk channels (legacy Unit/Responder/IC `LiveKitBottomSheet`), opened from anywhere by
 * `useLiveKitStore.setIsBottomSheetVisible(true)` — Unit's sidebar phone button — and mounted once by the shell as an
 * overlay. Lists the channels to join; once joined, the channel, who is talking, the microphone and speaker in use, and
 * mute, audio settings and disconnect. Renders nothing in a variant without PTT (`capabilities.voice.ptt`).
 */
export const VoiceChannelSheet: React.FC<VoiceChannelSheetProps> = ({ testID = 'voice-channel-sheet' }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const voice = useCapability('voice');
  const isOpen = useLiveKitStore((state) => state.isBottomSheetVisible);
  const channels = useLiveKitStore((state) => state.availableRooms);
  const isLoadingChannels = useLiveKitStore((state) => state.isLoadingSettings);
  const isTalking = useLiveKitStore((state) => state.isTalking);
  const microphone = useBluetoothAudioStore((state) => state.selectedAudioDevices.microphone?.name ?? null);
  const speaker = useBluetoothAudioStore((state) => state.selectedAudioDevices.speaker?.name ?? null);
  const ptt = usePtt('ui');
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // The channel list (and each channel's token) is read again every time the sheet opens.
  useEffect(() => {
    if (isOpen && voice.ptt) void useLiveKitStore.getState().fetchVoiceSettings();
  }, [isOpen, voice.ptt]);

  const { connect } = ptt;

  const join = useCallback(
    async (channel: VoiceChannel) => {
      setJoiningId(channel.Id);

      try {
        const result = await connect(channel);

        if (!result.ok) toast.error(t('livekit.join_failed'));
      } finally {
        setJoiningId(null);
      }
    },
    [connect, t, toast]
  );

  const openAudioSettings = useCallback(() => {
    close();
    // SAFETY: every app routes Settings at `/settings` (settings nav entries, all five route contracts), where the
    // microphone and speaker for push-to-talk are chosen.
    router.push('/settings' as Href);
  }, []);

  if (!voice.ptt) return null;

  const isConnected = ptt.isConnected && ptt.currentChannel !== null;
  const isMuted = !ptt.isTransmitting;

  return (
    <CustomBottomSheet
      isOpen={isOpen}
      onClose={close}
      isLoading={!isConnected && !ptt.isConnecting && channels.length === 0 ? isLoadingChannels : false}
      loadingText={t('common.loading')}
      snapPoints={[60]}
      testID={testID}
    >
      <Text className="text-xl font-bold text-typography-900" accessibilityRole="header">
        {t('livekit.title')}
      </Text>
      {ptt.isConnecting ? (
        <VStack space="sm" className="items-center py-8" testID={`${testID}-connecting`}>
          <Spinner size="large" />
          <Text className="text-center font-medium text-typography-500">{t('livekit.connecting')}</Text>
        </VStack>
      ) : isConnected ? (
        <VStack space="md" testID={`${testID}-connected`}>
          <Text className="text-lg font-bold text-typography-900">{t('livekit.connected_to_room')}</Text>
          <VStack space="sm" className="rounded-xl border border-outline-100 bg-background-50 p-4">
            <Text className="text-center text-lg font-medium text-typography-900" testID={`${testID}-channel`}>
              {ptt.currentChannel?.Name ?? ''}
            </Text>
            {isTalking ? (
              <Text className="text-center text-success-600" testID={`${testID}-speaking`}>
                {t('livekit.speaking')}
              </Text>
            ) : null}
            <VStack space="xs" className="mt-2 border-t border-outline-100 pt-2">
              <Text className="text-sm font-medium text-typography-600">{t('livekit.audio_devices')}</Text>
              <HStack space="md">
                <VStack className="flex-1">
                  <Text className="text-xs text-typography-500">{t('livekit.microphone')}</Text>
                  <Text className="text-sm text-typography-900">{microphone ?? t('common.unknown')}</Text>
                </VStack>
                <VStack className="flex-1">
                  <Text className="text-xs text-typography-500">{t('livekit.speaker')}</Text>
                  <Text className="text-sm text-typography-900">{speaker ?? t('common.unknown')}</Text>
                </VStack>
              </HStack>
            </VStack>
          </VStack>
          <HStack className="justify-around">
            <Pressable
              onPress={() => void ptt.toggleTransmitting()}
              accessibilityRole="button"
              accessibilityLabel={isMuted ? t('livekit.unmute') : t('livekit.mute')}
              accessibilityState={{ selected: !isMuted }}
              style={styles.control}
              testID={`${testID}-mute`}
            >
              <View>{isMuted ? <MicOff size={24} color="#dc2626" /> : <Mic size={24} color="#2563eb" />}</View>
              <Text className="mt-1 text-center text-typography-900">{isMuted ? t('livekit.unmute') : t('livekit.mute')}</Text>
            </Pressable>
            <Pressable onPress={openAudioSettings} accessibilityRole="button" accessibilityLabel={t('livekit.audio_settings')} style={styles.control} testID={`${testID}-audio-settings`}>
              <View>
                <Settings size={24} color="#6b7280" />
              </View>
              <Text className="mt-1 text-center text-typography-900">{t('livekit.audio_settings')}</Text>
            </Pressable>
            <Pressable onPress={() => void ptt.disconnect()} accessibilityRole="button" accessibilityLabel={t('livekit.disconnect')} style={styles.control} testID={`${testID}-disconnect`}>
              <View>
                <PhoneOff size={24} color="#dc2626" />
              </View>
              <Text className="mt-1 text-center text-typography-900">{t('livekit.disconnect')}</Text>
            </Pressable>
          </HStack>
        </VStack>
      ) : channels.length === 0 ? (
        isLoadingChannels ? null : (
          <Text className="py-8 text-center text-lg font-medium text-typography-500" testID={`${testID}-empty`}>
            {t('livekit.no_rooms_available')}
          </Text>
        )
      ) : (
        <VStack space="sm" testID={`${testID}-channels`}>
          {channels.map((channel) => (
            <HStack key={channel.Id} space="md" className="items-center justify-between rounded-xl border border-outline-100 bg-background-50 p-4" testID={`${testID}-channel-${channel.Id}`}>
              <Text className="flex-1 font-medium text-typography-900" numberOfLines={2}>
                {channel.Name}
              </Text>
              <Button size="sm" onPress={() => void join(channel)} isDisabled={joiningId !== null} accessibilityLabel={`${t('livekit.join')} ${channel.Name}`} testID={`${testID}-join-${channel.Id}`}>
                <ButtonText>{t('livekit.join')}</ButtonText>
              </Button>
            </HStack>
          ))}
        </VStack>
      )}
    </CustomBottomSheet>
  );
};

const styles = StyleSheet.create({
  control: { alignItems: 'center', padding: 12, minWidth: 80, minHeight: 48 },
});
