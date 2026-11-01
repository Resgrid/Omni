import { useCommandSupportStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { IncidentVoiceChannel } from '@resgrid/models';
import { Button, ButtonText, HStack, Text, useToast, VStack } from '@resgrid/ui';
import { useLiveKitStore, usePtt, useVoiceChannels } from '@resgrid/voice';
import { Mic, Plus, Radio, XCircle } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { BoardButton } from './board-buttons';
import { SectionCard, SectionEmpty } from './section-card';
import { TextField } from './sheets/sheet-form';

const EMPTY: IncidentVoiceChannel[] = [];

export interface VoiceSectionProps {
  callId: string;
  canManage: boolean;
  testID?: string;
}

/**
 * Incident push-to-talk channels (IC voice section, Dispatch command voice) on @resgrid/voice: the incident's on-demand
 * channels, join/leave and hold-to-talk; command staff create or close channels (online — LiveKit rooms). Hidden when
 * the variant has no PTT or the department has no voice.
 */
export const VoiceSection: React.FC<VoiceSectionProps> = ({ callId, canManage, testID = 'command-voice' }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { channels: rooms, isVoiceEnabled, refresh } = useVoiceChannels();
  const ptt = usePtt('ui');
  const incidentChannels = useCommandSupportStore((state) => state.voiceChannelsByCall[callId] ?? EMPTY);
  const fetchVoiceChannels = useCommandSupportStore((state) => state.fetchVoiceChannels);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    if (isVoiceEnabled) void fetchVoiceChannels(callId);
  }, [callId, fetchVoiceChannels, isVoiceEnabled]);

  const join = useCallback(
    async (channel: IncidentVoiceChannel) => {
      let room = rooms.find((candidate) => candidate.Id === channel.DepartmentVoiceChannelId);
      if (!room) {
        // New incident channels reach the voice settings (and their LiveKit tokens) on the next read.
        await refresh();
        room = useLiveKitStore.getState().availableRooms.find((candidate) => candidate.Id === channel.DepartmentVoiceChannelId);
      }
      if (!room) {
        toast.error(t('incident_command.voice_join_failed'));
        return;
      }
      const result = await ptt.connect(room);
      if (!result.ok) toast.error(t('incident_command.voice_join_failed'));
    },
    [ptt, refresh, rooms, t, toast]
  );

  const create = useCallback(
    async (channelName: string) => {
      const trimmed = channelName.trim();
      if (!trimmed) return;
      try {
        await useCommandSupportStore.getState().createVoiceChannel(callId, trimmed);
        setName('');
        setIsAdding(false);
        void refresh();
      } catch {
        toast.error(t('incident_command.voice_create_failed'));
      }
    },
    [callId, refresh, t, toast]
  );

  const closeAll = useCallback(async () => {
    try {
      if (ptt.isConnected && incidentChannels.some((channel) => channel.DepartmentVoiceChannelId === ptt.currentChannel?.Id)) await ptt.disconnect();
      await useCommandSupportStore.getState().closeVoiceChannels(callId);
    } catch {
      toast.error(t('incident_command.voice_close_failed'));
    }
  }, [callId, incidentChannels, ptt, t, toast]);

  if (!isVoiceEnabled) return null;

  return (
    <SectionCard
      title={t('incident_command.voice')}
      icon={Radio}
      count={incidentChannels.length}
      action={canManage ? <BoardButton label={t('incident_command.add_voice_channel')} icon={Plus} onPress={() => setIsAdding((open) => !open)} testID={`${testID}-add`} /> : undefined}
      testID={testID}
    >
      {isAdding ? (
        <VStack className="mb-3" testID={`${testID}-create`}>
          <HStack className="flex-wrap" space="sm">
            {[t('incident_command.voice_preset_tactical'), t('incident_command.voice_preset_command')].map((preset, index) => (
              <BoardButton key={preset} label={preset} onPress={() => void create(preset)} testID={`${testID}-preset-${index}`} />
            ))}
          </HStack>
          <TextField label={t('incident_command.voice_channel_name')} value={name} onChangeText={setName} testID={`${testID}-name`} />
          <Button size="sm" className="mt-2 self-start" onPress={() => void create(name)} isDisabled={!name.trim()} testID={`${testID}-create-submit`}>
            <ButtonText>{t('incident_command.create_voice_channel')}</ButtonText>
          </Button>
        </VStack>
      ) : null}
      {incidentChannels.length === 0 ? (
        <SectionEmpty text={t('incident_command.no_voice_channels')} />
      ) : (
        <VStack space="xs">
          {incidentChannels.map((channel) => {
            const isConnected = ptt.isConnected && ptt.currentChannel?.Id === channel.DepartmentVoiceChannelId;
            return (
              <HStack key={channel.DepartmentVoiceChannelId} className="items-center justify-between rounded-lg bg-background-50 p-2" space="sm" testID={`${testID}-channel-${channel.DepartmentVoiceChannelId}`}>
                <Text className="min-w-0 flex-1 font-medium text-typography-900">{channel.Name}</Text>
                {isConnected ? (
                  <HStack space="xs">
                    <Button
                      size="sm"
                      action={ptt.isTransmitting ? 'negative' : 'primary'}
                      onPressIn={() => void ptt.startTransmitting()}
                      onPressOut={() => void ptt.stopTransmitting()}
                      isDisabled={!ptt.canTransmit}
                      accessibilityLabel={t('incident_command.push_to_talk')}
                      testID={`${testID}-ptt`}
                    >
                      <View>
                        <Mic size={16} color="#ffffff" />
                      </View>
                    </Button>
                    <BoardButton label={t('incident_command.voice_leave')} onPress={() => void ptt.disconnect()} testID={`${testID}-leave`} />
                  </HStack>
                ) : (
                  <BoardButton
                    label={ptt.isConnecting ? t('incident_command.voice_connecting') : t('incident_command.voice_join')}
                    onPress={() => void join(channel)}
                    isDisabled={ptt.isConnecting}
                    testID={`${testID}-join-${channel.DepartmentVoiceChannelId}`}
                  />
                )}
              </HStack>
            );
          })}
          {canManage ? <BoardButton label={t('incident_command.close_voice_channels')} icon={XCircle} action="negative" variant="link" onPress={() => void closeAll()} testID={`${testID}-close-all`} /> : null}
        </VStack>
      )}
    </SectionCard>
  );
};
