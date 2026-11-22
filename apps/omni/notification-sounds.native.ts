import { CUSTOM_TONES, type NotificationSoundAssets, soundSetSounds } from '@resgrid/notifications';

import { nativeSoundSources } from './sound-sets/native-sources';

// iOS/Android, the shared sound set: the in-app player plays the copies withNotificationSounds already put in the native
// project (sound-sets/native-sources.ts) instead of bundling the ~11 MB of .wav again through Metro. Metro picks this
// file for native builds only; web and Electron get notification-sounds.ts. Each variant's root layout picks its sound
// set through sound-sets/<variant>.ts.
export const NOTIFICATION_SOUNDS: NotificationSoundAssets = nativeSoundSources([...soundSetSounds('shared'), ...CUSTOM_TONES]);
