import { useCapability } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import type { UnitInfoResultData, UnitResultData } from '@resgrid/models';
import { HStack, Pressable, Text, TypeIcon, View, VStack } from '@resgrid/ui';
import { useLiveKitStore } from '@resgrid/voice';
import { Mic, Phone, Truck } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { StyleSheet } from 'react-native';

export interface UnitSummaryCardProps {
  unit: UnitResultData | null;
  unitInfo: UnitInfoResultData | null;
  /** Console touch-target size. */
  buttonSize?: number;
  iconSize?: number;
  testID?: string;
}

/**
 * The active unit on the console (Unit `unit-sidebar`): type, name with its type icon, station, and the voice-channel
 * button (variant `voice.ptt`) that opens the shell's LiveKit sheet, showing the joined channel and who is talking.
 */
export const UnitSummaryCard: React.FC<UnitSummaryCardProps> = ({ unit, unitInfo, buttonSize = 44, iconSize = 18, testID = 'unit-summary-card' }) => {
  const { t } = useTranslation();
  const voice = useCapability('voice');
  const isConnected = useLiveKitStore((state) => state.isConnected);
  const isTalking = useLiveKitStore((state) => state.isTalking);
  const roomName = useLiveKitStore((state) => state.currentRoomInfo?.Name ?? null);

  const name = unit?.Name || unitInfo?.Name || t('common.no_unit');
  const type = unit?.Type || unitInfo?.Type || '';
  const group = unit?.GroupName || unitInfo?.GroupName || (unit || unitInfo ? '' : t('common.no_unit_selected'));

  const openVoice = useCallback(async () => {
    // Ask for the microphone before the sheet (its own window) opens: Android hides system dialogs behind modals.
    await useLiveKitStore.getState().ensureMicrophonePermission();
    useLiveKitStore.getState().setIsBottomSheetVisible(true);
  }, []);

  return (
    <View className="rounded-xl border border-outline-100 bg-background-50 p-3" testID={testID}>
      {type ? <Text className="text-sm text-typography-500">{type}</Text> : null}
      <HStack space="sm" className="items-center">
        <TypeIcon
          iconUrl={unit?.TypeIconUrl ?? unitInfo?.TypeIconUrl ?? null}
          mapIcon={unit?.TypeMapIcon ?? unitInfo?.TypeMapIcon ?? null}
          size={22}
          fallback={<Truck size={20} color="#6b7280" />}
          testID={`${testID}-type-icon`}
        />
        <Text className="flex-1 text-lg font-bold text-typography-900" numberOfLines={1} testID={`${testID}-name`}>
          {name}
        </Text>
      </HStack>
      {group ? <Text className="text-sm text-typography-500">{group}</Text> : null}
      {voice.ptt ? (
        <HStack space="sm" className="mt-2 items-center">
          <VStack className="flex-1">
            {isConnected && roomName ? (
              <HStack space="xs" className="items-center">
                <Text className="flex-shrink text-xs text-typography-500" numberOfLines={1} testID={`${testID}-room`}>
                  {roomName}
                </Text>
                {isTalking ? (
                  <View accessibilityLabel={t('livekit.speaking')} testID={`${testID}-talking`}>
                    <Mic size={14} color="#16a34a" />
                  </View>
                ) : null}
              </HStack>
            ) : null}
          </VStack>
          <Pressable
            onPress={() => void openVoice()}
            accessibilityRole="button"
            accessibilityLabel={t('livekit.title')}
            accessibilityState={{ selected: isConnected }}
            testID={`${testID}-voice`}
            style={StyleSheet.flatten([styles.round, { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 }, isConnected ? styles.roundActive : null])}
          >
            <Phone size={iconSize} color={isConnected ? '#ffffff' : '#2563eb'} />
          </Pressable>
        </HStack>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  round: { borderWidth: 1, borderColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  roundActive: { backgroundColor: '#2563eb' },
});
