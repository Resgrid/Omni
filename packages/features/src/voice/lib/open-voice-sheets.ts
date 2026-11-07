import { useAudioStreamStore, useLiveKitStore } from '@resgrid/voice';

/**
 * Opens the shell's voice channels sheet. The microphone is asked for first, before the sheet (its own window) opens:
 * Android hides system dialogs behind modals.
 */
export async function openVoiceChannelSheet(): Promise<void> {
  await useLiveKitStore.getState().ensureMicrophonePermission();
  useLiveKitStore.getState().setIsBottomSheetVisible(true);
}

/** Opens the shell's audio streams sheet (what is playing, or the department's streams to pick from). */
export function openAudioStreamSheet(): void {
  useAudioStreamStore.getState().setIsBottomSheetVisible(true);
}
