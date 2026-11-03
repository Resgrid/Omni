import type { VoiceSoundAssets } from '@resgrid/voice';

// The PTT and voice-room sounds (apps/omni/assets/audio/ui), passed to the app shell for configureVoice. iOS, web and
// Electron play these through expo-audio; Android plays the res/raw copies withInCallAudioModule makes and only falls
// back to these when InCallAudioModule is missing. Same files as @resgrid/voice ANDROID_SOUND_RESOURCES.
export const VOICE_SOUNDS: VoiceSoundAssets = {
  startTransmitting: require('./assets/audio/ui/space_notification1.mp3'),
  stopTransmitting: require('./assets/audio/ui/space_notification2.mp3'),
  connectedDevice: require('./assets/audio/ui/positive_interface_beep.mp3'),
  connectedToAudioRoom: require('./assets/audio/ui/software_interface_start.mp3'),
  disconnectedFromAudioRoom: require('./assets/audio/ui/software_interface_back.mp3'),
};
