import { useCapability } from '@resgrid/config';
import { useMapLock } from '@resgrid/features/map';
import { openAudioStreamSheet, openVoiceChannelSheet } from '@resgrid/features/voice';
import { useTranslation } from '@resgrid/i18n';
import type { UnitInfoResultData, UnitResultData } from '@resgrid/models';
import { HStack, Pressable, Text, TypeIcon, View } from '@resgrid/ui';
import { useAudioStreamStore, useLiveKitStore } from '@resgrid/voice';
import { Lock, type LucideIcon, Mic, Phone, Radio, Truck, Unlock } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { type Insets, type LayoutChangeEvent, StyleSheet } from 'react-native';

import { roundButtonRow } from '../lib/console-layout';

export interface UnitSummaryCardProps {
  unit: UnitResultData | null;
  unitInfo: UnitInfoResultData | null;
  /** Preferred size of the round map-lock, audio-stream and voice buttons (they shrink to share one row in a narrow card). */
  buttonSize?: number;
  iconSize?: number;
  /** Fills the space it is given (the sidebar's half-width card beside the status and roles). */
  fill?: boolean;
  testID?: string;
}

const ACTIVE_COLOR = '#2563eb';

/**
 * Space on either side of each round button inside its slot (slots rather than `gap`: web/Electron-safe). At the
 * sidebar's 36 pt a slot is 44 × 44 pt, so each button's hit slop makes it a full, separate 44 pt target.
 */
const SLOT_MARGIN = 4;

interface RoundButtonProps {
  icon: LucideIcon;
  active: boolean;
  size: number;
  iconSize: number;
  /** Up to a 44 pt target, inside its own slot's bounds (`roundButtonRow`). */
  hitSlop: Insets | undefined;
  label: string;
  onPress: () => void;
  testID: string;
}

function RoundButton({ icon: Icon, active, size, iconSize, hitSlop, label, onPress, testID }: RoundButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={hitSlop}
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
 * joined. The buttons share one row under the name, starting at its left edge, and shrink to fit a narrow card (the
 * sidebar's half-width one) instead of wrapping; only a card too narrow for even the smallest size wraps them.
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
  const [rowWidth, setRowWidth] = useState(0);
  const onRowLayout = useCallback((event: LayoutChangeEvent) => setRowWidth(Math.round(event.nativeEvent.layout.width)), []);

  const showMapLock = status.subject === 'unit';
  const buttonCount = (showMapLock ? 1 : 0) + 1 + (voice.ptt ? 1 : 0);
  const { size, wraps, slotWidth, slotHeight, hitSlop } = roundButtonRow(buttonSize, rowWidth, buttonCount, SLOT_MARGIN);
  // The slot holds the button's whole touch area: React Native drops a touch outside the parent's bounds, slop or not.
  const slotStyle = useMemo(() => StyleSheet.flatten([styles.buttonSlot, { width: slotWidth, height: slotHeight }]), [slotWidth, slotHeight]);
  const glyphSize = Math.min(iconSize, Math.round(size / 2));

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
      <View style={wraps ? styles.buttonsWrapped : styles.buttons} onLayout={onRowLayout} testID={`${testID}-buttons`}>
        {showMapLock ? (
          <View style={slotStyle}>
            <RoundButton
              icon={isMapLocked ? Lock : Unlock}
              active={isMapLocked}
              size={size}
              iconSize={glyphSize}
              hitSlop={hitSlop}
              label={isMapLocked ? t('map.unlock_map') : t('map.lock_map')}
              onPress={toggleMapLock}
              testID={`${testID}-map-lock`}
            />
          </View>
        ) : null}
        <View style={slotStyle}>
          <RoundButton icon={Radio} active={isStreamPlaying} size={size} iconSize={glyphSize} hitSlop={hitSlop} label={t('audio_streams.title')} onPress={openAudioStreamSheet} testID={`${testID}-audio-streams`} />
        </View>
        {voice.ptt ? (
          <View style={slotStyle}>
            <RoundButton icon={Phone} active={isConnected} size={size} iconSize={glyphSize} hitSlop={hitSlop} label={t('livekit.title')} onPress={() => void openVoiceChannelSheet()} testID={`${testID}-voice`} />
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // One row that pulls back the outer slots' side margins so the buttons line up with the text above.
  buttons: { flexDirection: 'row', justifyContent: 'flex-start', marginTop: 8, marginHorizontal: -SLOT_MARGIN },
  // A card too narrow for even the smallest buttons wraps them rather than letting the row run out of it.
  buttonsWrapped: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', marginTop: 8, marginHorizontal: -SLOT_MARGIN },
  buttonSlot: { alignItems: 'center', justifyContent: 'center' },
  round: { borderWidth: 1, borderColor: ACTIVE_COLOR, alignItems: 'center', justifyContent: 'center' },
  roundActive: { backgroundColor: ACTIVE_COLOR },
});
