import type { NotificationSound, NotificationSoundAssets } from '@resgrid/notifications';
import { Paths } from 'expo-file-system';
import { Platform } from 'react-native';

// iOS/Android: the in-app player (the Settings sound tests, desk events) plays the copies withNotificationSounds already
// put in the native project — the same files the OS plays for a push, from the app's own sound set — instead of
// bundling the .wav files again through Metro. Android: expo-audio reads a bare name as a res/raw resource. iOS: the
// files sit at the root of the app bundle. Only the `.native.ts` sound modules import this.
const bundleUri = (): string => {
  const uri = Paths.bundle.uri;

  return uri.endsWith('/') ? uri : `${uri}/`;
};

const nativeSource = (sound: NotificationSound): string => (Platform.OS === 'android' ? sound : `${bundleUri()}${sound}.wav`);

/** Each sound's native-project source, keyed by sound, for configureNotificationSounds. */
export const nativeSoundSources = (sounds: readonly NotificationSound[]): NotificationSoundAssets => Object.fromEntries(sounds.map((sound) => [sound, nativeSource(sound)]));
