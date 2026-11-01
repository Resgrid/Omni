import { logger } from '@resgrid/core';
import { getRecordingPermissionsAsync } from 'expo-audio';
import { PermissionsAndroid, Platform } from 'react-native';

export interface MicrophonePermissionResult {
  granted: boolean;
  /** False when the user must change it in system settings (the UI offers "Open settings"). */
  canAskAgain: boolean;
}

/**
 * Microphone permission before joining a channel (Unit livekit-store). Android asks through PermissionsAndroid directly
 * (expo-audio's fragment-based request can fail to show the dialog). iOS only checks: requesting would activate an audio
 * session that races LiveKit/CallKit; WebRTC prompts when the track is first published.
 */
export async function ensureMicrophonePermission(): Promise<MicrophonePermissionResult> {
  try {
    if (Platform.OS === 'android') {
      if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) return { granted: true, canAskAgain: true };
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (result === PermissionsAndroid.RESULTS.GRANTED) return { granted: true, canAskAgain: true };
      logger.warn({ message: 'Microphone permission not granted', context: { result } });
      return { granted: false, canAskAgain: result !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN };
    }
    if (Platform.OS === 'ios') {
      const permission = await getRecordingPermissionsAsync();
      if (permission.granted) return { granted: true, canAskAgain: true };
      if (!permission.canAskAgain) {
        logger.warn({ message: 'Microphone permission permanently denied' });
        return { granted: false, canAskAgain: false };
      }
      return { granted: true, canAskAgain: true };
    }
    return { granted: true, canAskAgain: true };
  } catch (error) {
    logger.error({ message: 'Failed to check microphone permission', context: { error } });
    return { granted: false, canAskAgain: true };
  }
}
