import { useCapability } from '@resgrid/config';
import { useMapLock } from '@resgrid/features/map';
import { openAudioStreamSheet, openVoiceChannelSheet } from '@resgrid/features/voice';
import { useTranslation } from '@resgrid/i18n';
import type { UnitInfoResultData, UnitResultData } from '@resgrid/models';
import { HStack, Pressable, Text, TypeIcon, View } from '@resgrid/ui';
import { useAudioStreamStore, useLiveKitStore } from '@resgrid/voice';
import { Lock, type LucideIcon, Mic, Phone, Radio, Truck, Unlock } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

export interface UnitSummaryCardProps {
  unit: UnitResultData | null;
  unitInfo: UnitInfoResultData | null;
  /** Size of the round map-lock, audio-stream and voice buttons. */
  buttonSize?: number;
  iconSize?: number;
  /** Fills the space it is given (the sidebar's half-width card beside the status and roles). */
  fill?: boolean;
  testID?: string;
}

/** Round buttons smaller than a touch target get the rest as hit slop, so every one is at least 44 pt to the finger. */
const MIN_TOUCH = 44;

const ACTIVE_COLOR = '#2563eb';

interface RoundButtonProps {
  icon: LucideIcon;
  active: boolean;
  size: number;
  iconSize: number;
  label: string;
  onPress: () => void;
  testID: string;
}

function RoundButton({ icon: Icon, active, size, iconSize, label, onPress, testID }: RoundButtonProps) {
  const slop = Math.max(0, Math.ceil((MIN_TOUCH - size) / 2));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={slop > 0 ? slop : undefined}
      testID={testID}
      style={StyleSheet.flatten([styles.round, { width: size, height: size, borderRadius: size / 2 }, active ? styles.roundActive : null])}
    >
      <View>
        <Icon size={iconSize} color={active ? '#ffffff' : ACTIVE_COLOR} />
      </View>
    </Pressable>
  );
}

/**
 * The active unit on the console (Unit `unit-sidebar`): type, name with its type icon, station, the voice channel it
 * has joined (and who is talking), and the crew's round buttons — lock the map to the unit (unit devices, whose map
 * follows the vehicle), the department's audio streams, and the voice channels (variant `voice.ptt`). The audio and
 * voice buttons open the shell's sheets (`@resgrid/features/voice`); each lights up while its stream plays / channel is
 * joined. The buttons wrap onto a second line in a narrow card rather than overflow it.
 */
export const UnitSummaryCard: React.FC<UnitSummaryCardProps> = ({ unit, unitInfo, buttonSize = 44, iconSize = 18, fill = false, testID = 'unit-summary-card' }) => {
  const { t } = useTranslation();
  const voice = useCapability('voice');
  const status = useCapability('status');
  const [isMapLocked, toggleMapLock] = useMapLock();
  const isConnected = useLiveKitStore((state) => state.isConnected);
  const isTalking = useLiveKitStore((state) => state.isTalking);
  const roomName = useLiveKitStore((state) => state.currentRoomInfo?.Name ?? null);
  const isStreamPlaying = useAudioStreamStore((state) => state.currentStream !== null && state.isPlaying);

  const name = unit?.Name || unitInfo?.Name || t('common.no_unit');
  const type = unit?.Type || unitInfo?.Type || '';
  const group = unit?.GroupName || unitInfo?.GroupName || (unit || unitInfo ? '' : t('common.no_unit_selected'));

  return (
    <View className="rounded-xl border border-outline-100 bg-background-50 p-3" style={fill ? styles.fill : undefined} testID={testID}>
      {type ? <Text className="text-sm text-typography-500">{type}</Text> : null}
      <HStack space="sm" className="items-center">
        <TypeIcon
          iconUrl={unit?.TypeIconUrl ?? unitInfo?.TypeIconUrl ?? null}
          mapIcon={unit?.TypeMapIcon ?? unitInfo?.TypeMapIcon ?? null}
          size={22}
          fallback={<Truck size={20} color="#6b7280" />}
          testID={`${testID}-type-icon`}
        />
        <Text className="flex-1 text-lg font-bold text-typography-900" numberOfLines={2} testID={`${testID}-name`}>
          {name}
        </Text>
      </HStack>
      {group ? <Text className="text-sm text-typography-500">{group}</Text> : null}
      {voice.ptt && isConnected && roomName ? (
        <HStack space="xs" className="mt-1 items-center">
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
      <View style={styles.buttons}>
        {status.subject === 'unit' ? (
          <View style={styles.buttonSlot}>
            <RoundButton
              icon={isMapLocked ? Lock : Unlock}
              active={isMapLocked}
              size={buttonSize}
              iconSize={iconSize}
              label={isMapLocked ? t('map.unlock_map') : t('map.lock_map')}
              onPress={toggleMapLock}
              testID={`${testID}-map-lock`}
            />
          </View>
        ) : null}
        <View style={styles.buttonSlot}>
          <RoundButton icon={Radio} active={isStreamPlaying} size={buttonSize} iconSize={iconSize} label={t('audio_streams.title')} onPress={openAudioStreamSheet} testID={`${testID}-audio-streams`} />
        </View>
        {voice.ptt ? (
          <View style={styles.buttonSlot}>
            <RoundButton icon={Phone} active={isConnected} size={buttonSize} iconSize={iconSize} label={t('livekit.title')} onPress={() => void openVoiceChannelSheet()} testID={`${testID}-voice`} />
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Margins rather than `gap` (web/Electron-safe); the row pulls back the first slot's left margin.
  buttons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 8, marginHorizontal: -3 },
  buttonSlot: { margin: 3 },
  round: { borderWidth: 1, borderColor: ACTIVE_COLOR, alignItems: 'center', justifyContent: 'center' },
  roundActive: { backgroundColor: ACTIVE_COLOR },
});
