import { CUSTOM_TONES, MODERN_SOUNDS, type NotificationSound, type NotificationSoundAssets } from '@resgrid/notifications';
import { Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// iOS/Android: the in-app player (the Settings sound tests) plays the copies withNotificationSounds already put in the
// native project — the same files the OS plays for a push — instead of bundling the ~19 MB of .wav again through Metro.
// Android: expo-audio reads a bare name as a res/raw resource. iOS: the files sit at the root of the app bundle.
// Metro picks this file for native builds only; web and Electron get notification-sounds.ts.
const bundleUri = (): string => {
  const uri = Paths.bundle.uri;
  return uri.endsWith('/') ? uri : `${uri}/`;
};

const nativeSource = (sound: NotificationSound): string => (Platform.OS === 'android' ? sound : `${bundleUri()}${sound}.wav`);

export const NOTIFICATION_SOUNDS: NotificationSoundAssets = Object.fromEntries([...MODERN_SOUNDS, ...CUSTOM_TONES].map((sound) => [sound, nativeSource(sound)]));
