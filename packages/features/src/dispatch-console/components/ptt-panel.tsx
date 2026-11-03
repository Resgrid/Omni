import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, Spinner, Text, useThemeColors, VStack } from '@resgrid/ui';
import { DEFAULT_DESKTOP_PTT_HOTKEY, formatHotkey, useDesktopPtt, usePtt, useVoiceChannels, useVoiceStatus, type VoiceChannel } from '@resgrid/voice';
import { Check, PhoneOff, Radio, Wifi, WifiOff } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useConsoleStore } from '../hooks/use-console-store';

// Dispatch's PTT colours: the state badge and the round talk button.
const PTT_COLORS = { off: '#6b7280', connecting: '#f59e0b', receive: '#22c55e', transmit: '#ef4444', connected: '#3b82f6', disabled: '#9ca3af' } as const;

export interface PttPanelProps {
  flex?: number;
}

/**
 * The console's push-to-talk bar (Dispatch baseline PTT interface) over @resgrid/voice: a state badge (off, connecting,
 * RX, TX), the channel (tap to choose another), disconnect, a round tap-to-toggle talk button and, on web/Electron, the
 * hold-to-talk hotkey. Transmissions start and end lines in the activity log. Hidden when the variant has no PTT or the
 * department has voice off.
 */
export const PttPanel: React.FC<PttPanelProps> = ({ flex }) => {
  const { t } = useTranslation();
  const colors = useThemeColors();
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
  const isDisabled = isBusy || !channel;

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

  const badge = isBusy
    ? { text: '…', color: PTT_COLORS.connecting }
    : ptt.isConnected
      ? ptt.isTransmitting
        ? { text: t('dispatch_console.ptt_tx'), color: PTT_COLORS.transmit }
        : { text: t('dispatch_console.ptt_rx'), color: PTT_COLORS.receive }
      : { text: t('dispatch_console.ptt_off'), color: PTT_COLORS.off };

  const talkColor = !channel ? PTT_COLORS.disabled : isBusy ? PTT_COLORS.connecting : ptt.isTransmitting ? PTT_COLORS.transmit : ptt.isConnected ? PTT_COLORS.connected : PTT_COLORS.receive;

  return (
    <View style={StyleSheet.flatten([styles.panel, flex !== undefined ? { flex } : null])} className="overflow-hidden rounded-lg border border-outline-200 bg-background-0" testID="ptt-panel">
      <HStack space="sm" className="items-center p-2">
        <View style={StyleSheet.flatten([styles.badge, { backgroundColor: badge.color }])} testID="ptt-badge">
          <Text className="text-xs font-bold" style={styles.onFill}>
            {badge.text}
          </Text>
        </View>
        <Pressable
          onPress={() => setIsChoosing((open) => !open)}
          disabled={channels.length === 0}
          accessibilityRole="button"
          accessibilityLabel={t('dispatch_console.ptt_channel')}
          className="flex-1"
          testID="ptt-channel"
        >
          <HStack space="xs" className="items-center">
            <View>{ptt.isConnected ? <Wifi size={12} color={PTT_COLORS.receive} /> : <WifiOff size={12} color={colors.token('typography-400')} />}</View>
            <Text className={`flex-1 text-xs ${ptt.isConnected ? 'font-medium text-success-600' : 'text-typography-500'}`} numberOfLines={1}>
              {channel?.Name ?? (isLoading ? t('common.loading') : t('dispatch_console.ptt_no_channels'))}
            </Text>
          </HStack>
          <Text className="text-2xs text-typography-500" numberOfLines={1} testID="ptt-state">
            {stateText}
          </Text>
        </Pressable>
        {ptt.isConnected ? (
          <Pressable
            onPress={() => void ptt.disconnect()}
            accessibilityRole="button"
            accessibilityLabel={t('dispatch_console.ptt_disconnect')}
            style={StyleSheet.flatten([styles.round, styles.disconnect])}
            testID="ptt-disconnect"
          >
            <View>
              <PhoneOff size={16} color="#ffffff" />
            </View>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void toggleTransmit()}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDisabled, selected: ptt.isTransmitting }}
          accessibilityLabel={ptt.isConnected ? (ptt.isTransmitting ? t('dispatch_console.ptt_stop') : t('dispatch_console.ptt_talk')) : t('dispatch_console.ptt_connect')}
          style={StyleSheet.flatten([styles.round, styles.talk, { backgroundColor: talkColor }, ptt.isTransmitting ? styles.talking : null])}
          testID="ptt-talk"
        >
          {isBusy ? (
            <Spinner size="small" color="#ffffff" />
          ) : (
            <View>
              <Radio size={18} color="#ffffff" />
            </View>
          )}
        </Pressable>
      </HStack>

      {isChoosing ? (
        <VStack className="border-t border-outline-200" testID="ptt-channel-list">
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
              <Text className="flex-1 text-sm text-typography-800">{entry.Name}</Text>
              {channel?.Id === entry.Id ? (
                <View>
                  <Check size={14} color={colors.primaryStrong} />
                </View>
              ) : null}
            </Pressable>
          ))}
        </VStack>
      ) : null}

      {desktop.isActive && ptt.isConnected ? (
        <Text className="px-2 pb-2 text-xs text-typography-400">{t('dispatch_console.ptt_hotkey_hint', { hotkey: formatHotkey(desktop.hotkey ?? DEFAULT_DESKTOP_PTT_HOTKEY) })}</Text>
      ) : null}
      {ptt.error ? (
        <View style={styles.error} testID="ptt-error">
          <Text className="text-xs" style={styles.onFill}>
            {ptt.error.code === 'permission_denied' ? t('dispatch_console.ptt_error_permission') : t('dispatch_console.ptt_error')}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { minWidth: 0, marginBottom: 8 },
  badge: { minWidth: 28, alignItems: 'center', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  onFill: { color: '#ffffff' },
  round: { alignItems: 'center', justifyContent: 'center' },
  disconnect: { width: 36, height: 36, borderRadius: 18, backgroundColor: PTT_COLORS.transmit },
  talk: { width: 44, height: 44, borderRadius: 22, shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 3 },
  talking: { transform: [{ scale: 0.95 }] },
  error: { backgroundColor: PTT_COLORS.transmit, paddingHorizontal: 8, paddingVertical: 4 },
});
