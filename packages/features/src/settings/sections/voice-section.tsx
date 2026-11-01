import { useCapability } from '@resgrid/config';
import { logger } from '@resgrid/core';
import { OptionSheet } from '@resgrid/features/auth-ui';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonText, CustomBottomSheet, Heading, HStack, Pressable, Spinner, Text, useToast, VStack } from '@resgrid/ui';
import { type AudioDeviceInfo, BluetoothState, getBluetoothAudioService, SYSTEM_AUDIO_DEVICE, useBluetoothAudioStore } from '@resgrid/voice';
import React, { useCallback, useEffect, useState } from 'react';

import { SettingsRow } from '../components/settings-row';

/**
 * Bluetooth PTT handset selection (Responder `bluetooth-device-selection-bottom-sheet`): scans when opened, lists the
 * handsets found plus "System audio" (the phone's own speaker and microphone), remembers the choice and connects it.
 */
export const BluetoothDeviceSheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const devices = useBluetoothAudioStore((state) => state.availableDevices);
  const isScanning = useBluetoothAudioStore((state) => state.isScanning);
  const bluetoothState = useBluetoothAudioStore((state) => state.bluetoothState);
  const preferred = useBluetoothAudioStore((state) => state.preferredDevice);
  const connected = useBluetoothAudioStore((state) => state.connectedDevice);
  const [connecting, setConnecting] = useState<string | null>(null);

  const scan = useCallback(async () => {
    const service = getBluetoothAudioService();
    if (!service) {
      return;
    }
    try {
      await service.startScanning(10_000);
    } catch {
      toast.error(t('bluetooth.scan_error_message'), t('bluetooth.scan_error_title'));
    }
  }, [t, toast]);

  useEffect(() => {
    if (isOpen) {
      void scan();
    }
  }, [isOpen, scan]);

  const select = useCallback(
    async (id: string, name: string) => {
      const service = getBluetoothAudioService();
      if (!service || connecting) {
        return;
      }
      setConnecting(id);
      try {
        if (id === SYSTEM_AUDIO_DEVICE.id) {
          await service.connectToSystemAudio();
        } else {
          service.setPreferredDevice({ id, name });
          await service.connectToDevice(id);
        }
        onClose();
      } catch {
        logger.warn({ message: 'Connecting the selected audio device failed' });
        toast.error(t('bluetooth.connection_error_message'), t('bluetooth.connection_error_title'));
      } finally {
        setConnecting(null);
      }
    },
    [connecting, onClose, t, toast]
  );

  const stateMessage = bluetoothState === BluetoothState.PoweredOff ? t('bluetooth.poweredOff') : bluetoothState === BluetoothState.Unauthorized ? t('bluetooth.unauthorized') : null;
  const rows = [
    { id: SYSTEM_AUDIO_DEVICE.id, name: t('bluetooth.system_audio'), description: t('bluetooth.system_audio_description') },
    ...devices.map((device) => ({ id: device.id, name: device.name ?? t('bluetooth.unknown_device'), description: device.isConnected ? t('bluetooth.connected') : null })),
  ];

  return (
    <CustomBottomSheet isOpen={isOpen} onClose={onClose} snapPoints={[70]} testID="bluetooth-device-sheet">
      <VStack space="sm" className="w-full" accessibilityRole="radiogroup" accessibilityLabel={t('bluetooth.select_device')}>
        <Heading size="md" accessibilityRole="header">
          {t('bluetooth.select_device')}
        </Heading>
        {stateMessage ? (
          <Text size="sm" className="text-warning-700" testID="bluetooth-state-message">
            {stateMessage}
          </Text>
        ) : null}
        {rows.map((row) => {
          const isSelected = preferred?.id === row.id;
          return (
            <Pressable
              key={row.id}
              onPress={() => void select(row.id, row.name)}
              disabled={connecting !== null}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, disabled: connecting !== null }}
              accessibilityLabel={row.description ? `${row.name}, ${row.description}` : row.name}
              testID={`bluetooth-device-${row.id}`}
              className={`rounded-lg px-3 py-3 ${isSelected ? 'bg-background-100' : ''}`}
            >
              <HStack className="items-center justify-between">
                <VStack className="flex-1">
                  <Text className={isSelected ? 'font-semibold' : ''}>{row.name}</Text>
                  {row.description ? (
                    <Text size="xs" className="text-typography-500">
                      {row.description}
                    </Text>
                  ) : null}
                </VStack>
                {connecting === row.id ? <Spinner size="small" /> : connected?.id === row.id ? <Text size="xs">{t('bluetooth.connected')}</Text> : null}
              </HStack>
            </Pressable>
          );
        })}
        {!isScanning && devices.length === 0 ? <Text size="sm">{t('bluetooth.noDevicesFoundRetry')}</Text> : null}
        <Button variant="outline" action="secondary" onPress={() => void scan()} isDisabled={isScanning} accessibilityLabel={isScanning ? t('bluetooth.scanning') : t('bluetooth.scan_again')} testID="bluetooth-scan">
          <ButtonText>{isScanning ? t('bluetooth.scanning') : t('bluetooth.scan_again')}</ButtonText>
        </Button>
      </VStack>
    </CustomBottomSheet>
  );
};

type AudioPicker = 'microphone' | 'speaker' | null;

/** Voice: the Bluetooth PTT handset (`capabilities.voice.bluetoothPtt`) and the microphone/speaker for PTT (`voice.ptt`). */
export const VoiceSection: React.FC = () => {
  const { t } = useTranslation();
  const voice = useCapability('voice');
  const preferred = useBluetoothAudioStore((state) => state.preferredDevice);
  const connected = useBluetoothAudioStore((state) => state.connectedDevice);
  const audioDevices = useBluetoothAudioStore((state) => state.availableAudioDevices);
  const selected = useBluetoothAudioStore((state) => state.selectedAudioDevices);
  const setMicrophone = useBluetoothAudioStore((state) => state.setSelectedMicrophone);
  const setSpeaker = useBluetoothAudioStore((state) => state.setSelectedSpeaker);
  const [bluetoothOpen, setBluetoothOpen] = useState(false);
  const [audioPicker, setAudioPicker] = useState<AudioPicker>(null);

  const microphones = audioDevices.filter((device) => device.isAvailable && device.type !== 'speaker');
  const speakers = audioDevices.filter((device) => device.isAvailable && device.type !== 'microphone');
  const toOptions = (list: AudioDeviceInfo[]) => list.map((device) => ({ value: device.id, label: device.name }));
  const pick = (list: AudioDeviceInfo[], apply: (device: AudioDeviceInfo | null) => void) => (id: string) => apply(list.find((device) => device.id === id) ?? null);
  const bluetoothStatus = preferred ? (connected?.id === preferred.id ? t('bluetooth.connected') : t('bluetooth.not_connected')) : null;

  return (
    <>
      {voice.bluetoothPtt ? (
        <SettingsRow
          label={t('bluetooth.audio_device')}
          value={preferred?.name ?? t('bluetooth.no_device_selected')}
          description={bluetoothStatus}
          onPress={() => setBluetoothOpen(true)}
          testID="settings-bluetooth-device"
        />
      ) : null}
      {voice.ptt ? (
        <>
          <SettingsRow
            label={t('settings.audio_device_selection.microphone')}
            value={selected.microphone?.name ?? t('settings.audio_device_selection.none_selected')}
            onPress={() => setAudioPicker('microphone')}
            testID="settings-microphone"
          />
          <SettingsRow
            label={t('settings.audio_device_selection.speaker')}
            value={selected.speaker?.name ?? t('settings.audio_device_selection.none_selected')}
            onPress={() => setAudioPicker('speaker')}
            testID="settings-speaker"
          />
        </>
      ) : null}
      {voice.bluetoothPtt ? <BluetoothDeviceSheet isOpen={bluetoothOpen} onClose={() => setBluetoothOpen(false)} /> : null}
      <OptionSheet
        isOpen={audioPicker === 'microphone'}
        onClose={() => setAudioPicker(null)}
        title={t('settings.audio_device_selection.microphone')}
        options={toOptions(microphones)}
        selected={selected.microphone?.id ?? null}
        onSelect={pick(microphones, setMicrophone)}
        testID="microphone-sheet"
      />
      <OptionSheet
        isOpen={audioPicker === 'speaker'}
        onClose={() => setAudioPicker(null)}
        title={t('settings.audio_device_selection.speaker')}
        options={toOptions(speakers)}
        selected={selected.speaker?.id ?? null}
        onSelect={pick(speakers, setSpeaker)}
        testID="speaker-sheet"
      />
    </>
  );
};
