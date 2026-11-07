import { useCapability } from '@resgrid/config';
import { useTranslation } from '@resgrid/i18n';
import { contentOnFill, Pressable, Text, useThemeColors, View } from '@resgrid/ui';
import { useAudioStreamStore, useLiveKitStore } from '@resgrid/voice';
import { Headphones, type LucideIcon, Mic } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { openAudioStreamSheet, openVoiceChannelSheet } from '../lib/open-voice-sheets';

export interface VoiceMenuButtonsProps {
  testID?: string;
}

interface MenuButtonProps {
  icon: LucideIcon;
  label: string;
  color: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}

/** Outlined in its colour; filled while what it opens is live (channel joined, stream playing). */
function MenuButton({ icon: Icon, label, color, active, onPress, testID }: MenuButtonProps) {
  const content = active ? contentOnFill(color) : color;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      testID={testID}
      style={StyleSheet.flatten([styles.button, { borderColor: color }, active ? { backgroundColor: color } : null])}
    >
      <View style={styles.icon}>
        <Icon size={18} color={content} />
      </View>
      <Text style={StyleSheet.flatten([styles.label, { color: content }])} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The member menu's Voice and Stream buttons (Responder's side menu, manifest `shell.sidebarContent: "member-menu"`; legacy
 * Responder `side-menu-ptt-button` / `side-menu-audio-button`). Voice opens the department voice channels (variant
 * `voice.ptt`) and Stream the audio streams, each through the shell's sheet, so the menu stays open behind it. Each
 * fills while its channel is joined / its stream plays.
 */
export function VoiceMenuButtons({ testID = 'voice-menu-buttons' }: VoiceMenuButtonsProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const voice = useCapability('voice');
  const isConnected = useLiveKitStore((state) => state.isConnected);
  const isStreamPlaying = useAudioStreamStore((state) => state.currentStream !== null && state.isPlaying);

  return (
    <View style={styles.row} testID={testID}>
      {voice.ptt ? (
        <View style={styles.slot}>
          <MenuButton icon={Mic} label={t('sidebar.ptt')} color={colors.token('success-600')} active={isConnected} onPress={() => void openVoiceChannelSheet()} testID={`${testID}-voice`} />
        </View>
      ) : null}
      <View style={styles.slot}>
        <MenuButton icon={Headphones} label={t('sidebar.audio')} color={colors.token('info-600')} active={isStreamPlaying} onPress={openAudioStreamSheet} testID={`${testID}-stream`} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Side by side in the drawer and a tablet's column; one above the other in a landscape phone's narrow column, where two
  // would cut their labels short. Margins rather than `gap` (web/Electron-safe); the row pulls back the slots' margins.
  row: { flexDirection: 'row', flexWrap: 'wrap', margin: -6 },
  slot: { flexGrow: 1, flexBasis: 100, margin: 6 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  icon: { marginRight: 8 },
  label: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
});
