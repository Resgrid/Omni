// @resgrid/features/voice — the shared voice sheets on @resgrid/voice: department push-to-talk channels and audio
// (scanner) streams. Each opens from its store's `setIsBottomSheetVisible(true)` (`openVoiceChannelSheet()` /
// `openAudioStreamSheet()`) and is mounted once by the shell (apps/omni/shell-registrations.tsx registers both as
// overlays), so a button anywhere can open it — Unit's sidebar card, Responder's side menu (`VoiceMenuButtons`).
import { AudioStreamSheet, type AudioStreamSheetProps } from './components/audio-stream-sheet';
import { VoiceChannelSheet, type VoiceChannelSheetProps } from './components/voice-channel-sheet';
import { VoiceMenuButtons, type VoiceMenuButtonsProps } from './components/voice-menu-buttons';
import { openAudioStreamSheet, openVoiceChannelSheet } from './lib/open-voice-sheets';

export { AudioStreamSheet, type AudioStreamSheetProps, openAudioStreamSheet, openVoiceChannelSheet, VoiceChannelSheet, type VoiceChannelSheetProps, VoiceMenuButtons, type VoiceMenuButtonsProps };
