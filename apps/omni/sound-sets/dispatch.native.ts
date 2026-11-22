import { CUSTOM_TONES, type NotificationSoundAssets, soundSetSounds } from '@resgrid/notifications';

import { nativeSoundSources } from './native-sources';

// iOS/Android, the Dispatch sound set: the copies withNotificationSounds put in the native project from
// apps/omni/variants/dispatch/assets/audio (its modern sounds, the desk sounds) plus the shared custom tones.
export const NOTIFICATION_SOUNDS: NotificationSoundAssets = nativeSoundSources([...soundSetSounds('dispatch'), ...CUSTOM_TONES]);
