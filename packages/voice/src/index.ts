// @resgrid/voice (layer L3) — LiveKit push-to-talk, CallKeep, Bluetooth and headset PTT, desktop hotkey PTT, audio
// routing and department audio streams (omni-plan §7.8). Imports only config, models, core, api and offline (types);
// auth, notifications, assets and translations are injected through configureVoice().

// Setup
export { getVoiceCapabilities, type VoiceCapabilities } from './capabilities';
export { initializeVoice, type InitializeVoiceOptions, registerVoiceResets } from './initialize';
export {
  configureVoice,
  PREFERRED_BLUETOOTH_DEVICE_KEY,
  VOICE_PRESERVED_KEYS,
  type VoiceForegroundService,
  type VoicePreferenceStorage,
  type VoiceRuntimeOptions,
  type VoiceSoundAssets,
  type VoiceSoundName,
  type VoiceSoundSource,
} from './runtime';

// LiveKit PTT
export { createNotifeeForegroundService, type NotifeeForegroundServiceOptions } from './livekit/foreground-service';
export { createInitialLiveKitState, type LiveKitState, selectSelectedRoom, useLiveKitStore, type VoiceChannel } from './livekit/livekit-store';
export type { MicrophonePermissionResult } from './livekit/microphone-permission';
export { type VoiceError, type VoiceErrorCode, type VoiceResult } from './livekit/types';
export { getMicrophoneController, type MicrophoneController, type PttInputSource } from './ptt/microphone-controller';

// Audio
export { type AudioRouteTarget, resolveAudioRouteTarget } from './audio/audio-route';
export { applyAudioRouting } from './audio/audio-session';
export { voiceSounds } from './audio/voice-sounds';

// CallKeep
export { getCallKeepService } from './callkeep/callkeep-service';
export { type CallKeepService, type CallKeepSetupConfig, noopCallKeepService } from './callkeep/types';

// Headset buttons
export { getHeadsetButtonService } from './headset/headset-button-service';
export type { HeadsetButtonService, HeadsetButtonType, HeadsetMonitorOwner } from './headset/types';

// Bluetooth PTT
export { type BluetoothAudioState, findDefaultAudioDevices, useBluetoothAudioStore } from './bluetooth/bluetooth-audio-store';
export { getBluetoothAudioService } from './bluetooth/bluetooth-service';
export { type DeviceFamily, isAudioDevice, parseButtonData } from './bluetooth/device-profiles';
export {
  type AudioButtonEvent,
  type AudioDeviceInfo,
  type AudioDeviceSelection,
  type BluetoothAudioDevice,
  type BluetoothAudioService,
  BluetoothState,
  DEFAULT_MEDIA_BUTTON_PTT_SETTINGS,
  type MediaButtonPttSettings,
  type PreferredBluetoothDevice,
  type PttMode,
  SYSTEM_AUDIO_DEVICE,
} from './bluetooth/types';

// Desktop PTT
export { DEFAULT_DESKTOP_PTT_HOTKEY, DesktopPttController, type DesktopPttHotkey, type DesktopPttMode, formatHotkey, isEditableTarget } from './desktop/desktop-ptt-controller';

// Department audio streams
export { type AudioStreamError, type AudioStreamState, useAudioStreamStore } from './audio-streams/audio-stream-store';
export { redactStreamUrl, resolveStreamSource } from './audio-streams/stream-source';
export type { AudioStream } from './audio-streams/types';

// Hooks
export { useAudioStreams, type UseAudioStreamsOptions, type UseAudioStreamsResult } from './hooks/use-audio-streams';
export { useDesktopPtt, type UseDesktopPttOptions, type UseDesktopPttResult } from './hooks/use-desktop-ptt';
export { usePtt, type UsePttResult } from './hooks/use-ptt';
export { useVoiceChannels, type UseVoiceChannelsOptions, type UseVoiceChannelsResult } from './hooks/use-voice-channels';
export { deriveVoiceStatus, useVoiceStatus, type VoiceConnectionStatus, type VoiceStatus } from './hooks/use-voice-status';
