// @resgrid/features/voice — the shared voice sheets on @resgrid/voice: department push-to-talk channels and audio
// (scanner) streams. Each opens from its store's `setIsBottomSheetVisible(true)` and is mounted once by the shell
// (apps/omni/shell-registrations.tsx registers both as overlays), so a button anywhere can open it.
import { AudioStreamSheet, type AudioStreamSheetProps } from './components/audio-stream-sheet';
import { VoiceChannelSheet, type VoiceChannelSheetProps } from './components/voice-channel-sheet';

export { AudioStreamSheet, type AudioStreamSheetProps, VoiceChannelSheet, type VoiceChannelSheetProps };
