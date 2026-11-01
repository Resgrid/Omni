import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, HStack, Pressable, Text, VStack } from '@resgrid/ui';
import { DEFAULT_DESKTOP_PTT_HOTKEY, formatHotkey, useDesktopPtt, usePtt, useVoiceChannels, useVoiceStatus, type VoiceChannel } from '@resgrid/voice';
import { Check, Mic, PhoneOff, Radio, Wifi, WifiOff } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useConsoleStore } from '../hooks/use-console-store';
import { PanelFrame } from './panel-frame';

export interface PttPanelProps {
  flex?: number;
}

/**
 * The console's push-to-talk (Dispatch baseline PTT interface) over @resgrid/voice: the department's channels, connect /
 * disconnect, a tap-to-toggle transmit button and, on web/Electron, the hold-to-talk hotkey. Transmissions start and
 * end lines in the activity log. Hidden when the variant has no PTT or the department has voice off.
 */
export const PttPanel: React.FC<PttPanelProps> = ({ flex }) => {
  const { t } = useTranslation();
  const ptt = usePtt('ui');
  const { channels, selectedChannel, defaultChannel, isVoiceEnabled, isLoading, selectChannel } = useVoiceChannels();
  const status = useVoiceStatus();
  const desktop = useDesktopPtt();
  const [isChoosing, setIsChoosing] = useState(false);
  const channel = ptt.currentChannel ?? selectedChannel ?? defaultChannel;

  const log = useCallback((action: string, description: string) => useConsoleStore.getState().addActivity({ type: 'system', action, description }), []);

  const connectTo = useCallback(
    async (target: VoiceChannel | null) => {
      if (!target) return;
      if (ptt.isConnected) await ptt.disconnect();
      selectChannel(target);
      await ptt.connect(target);
    },
    [ptt, selectChannel]
  );

  const toggleTransmit = useCallback(async () => {
    if (!ptt.isConnected) {
      await connectTo(channel);
      return;
    }
    const starting = !ptt.isTransmitting;
    await ptt.toggleTransmitting();
    log(starting ? t('dispatch.ptt_start') : t('dispatch.ptt_end'), starting ? t('dispatch.transmitting_on', { channel: channel?.Name ?? '' }) : t('dispatch.transmission_ended'));
  }, [channel, connectTo, log, ptt, t]);

  if (!isVoiceEnabled) return null;

  const isBusy = ptt.isConnecting || ptt.isReconnecting;
  const stateText = ptt.isTransmitting
    ? t('dispatch.transmitting')
    : ptt.isReconnecting
      ? t('dispatch_console.ptt_reconnecting')
      : ptt.isConnecting
        ? t('dispatch_console.ptt_connecting')
        : ptt.isConnected
          ? status.isSomeoneTalking
            ? t('dispatch_console.ptt_receiving')
            : t('dispatch_console.ptt_ready')
          : t('dispatch.disconnected');

  return (
    <PanelFrame title={t('dispatch_console.ptt')} icon={Radio} iconColor="#16a34a" cardKey="ptt" flex={flex} testID="ptt-panel">
      <VStack space="sm" className="p-3">
        <HStack space="sm" className="items-center justify-between">
          <Pressable
            onPress={() => setIsChoosing((open) => !open)}
            disabled={channels.length === 0}
            accessibilityRole="button"
            accessibilityLabel={t('dispatch_console.ptt_channel')}
            className="flex-1 flex-row items-center rounded-lg border border-outline-200 px-3 py-2"
            testID="ptt-channel"
          >
            <View>{ptt.isConnected ? <Wifi size={14} color="#16a34a" /> : <WifiOff size={14} color="#9ca3af" />}</View>
            <Text className="ml-2 flex-1 text-sm" numberOfLines={1}>
              {channel?.Name ?? (isLoading ? t('common.loading') : t('dispatch_console.ptt_no_channels'))}
            </Text>
          </Pressable>
          {ptt.isConnected ? (
            <Pressable
              onPress={() => void ptt.disconnect()}
              accessibilityRole="button"
              accessibilityLabel={t('dispatch_console.ptt_disconnect')}
              className="rounded-lg border border-error-300 p-2"
              testID="ptt-disconnect"
            >
              <View>
                <PhoneOff size={16} color="#dc2626" />
              </View>
            </Pressable>
          ) : null}
        </HStack>

        {isChoosing ? (
          <VStack className="rounded-lg border border-outline-200" testID="ptt-channel-list">
            {channels.map((entry) => (
              <Pressable
                key={entry.Id}
                onPress={() => {
                  setIsChoosing(false);
                  void connectTo(entry);
                }}
                accessibilityRole="button"
                className="flex-row items-center border-b border-outline-100 px-3 py-2"
                testID={`ptt-channel-${entry.Id}`}
              >
                <Text className="flex-1 text-sm">{entry.Name}</Text>
                {channel?.Id === entry.Id ? (
                  <View>
                    <Check size={14} color="#4f46e5" />
                  </View>
                ) : null}
              </Pressable>
            ))}
          </VStack>
        ) : null}

        <Button
          size="lg"
          action={ptt.isTransmitting ? 'negative' : 'primary'}
          onPress={() => void toggleTransmit()}
          isDisabled={isBusy || !channel}
          accessibilityLabel={ptt.isTransmitting ? t('dispatch_console.ptt_stop') : t('dispatch_console.ptt_talk')}
          style={StyleSheet.flatten([styles.talk, ptt.isTransmitting ? styles.talking : null])}
          testID="ptt-talk"
        >
          {isBusy ? (
            <ButtonSpinner />
          ) : (
            <View>
              <Mic size={18} color="#ffffff" />
            </View>
          )}
          <ButtonText>{ptt.isConnected ? (ptt.isTransmitting ? t('dispatch_console.ptt_stop') : t('dispatch_console.ptt_talk')) : t('dispatch_console.ptt_connect')}</ButtonText>
        </Button>
        <Text className="text-center text-xs text-typography-500" testID="ptt-state">
          {stateText}
        </Text>
        {desktop.isActive && ptt.isConnected ? (
          <Text className="text-center text-xs text-typography-400">{t('dispatch_console.ptt_hotkey_hint', { hotkey: formatHotkey(desktop.hotkey ?? DEFAULT_DESKTOP_PTT_HOTKEY) })}</Text>
        ) : null}
        {ptt.error ? (
          <Text className="text-center text-xs text-error-600" testID="ptt-error">
            {ptt.error.code === 'permission_denied' ? t('dispatch_console.ptt_error_permission') : t('dispatch_console.ptt_error')}
          </Text>
        ) : null}
      </VStack>
    </PanelFrame>
  );
};

const styles = StyleSheet.create({
  talk: { minHeight: 56 },
  talking: { borderWidth: 2, borderColor: '#fca5a5' },
});
