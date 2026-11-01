/**
 * Results and errors the voice stores hand back to the UI. Stores never show alerts or open settings themselves
 * (AGENTS.md): the UI maps a code to translated text and, for `permission_denied` with `canAskAgain: false`, offers
 * "Open settings".
 */
export type VoiceErrorCode =
  | 'not_configured'
  | 'voice_disabled'
  | 'no_server'
  | 'no_token'
  | 'permission_denied'
  | 'timeout'
  | 'connect_failed'
  | 'busy'
  | 'cancelled'
  | 'disconnected'
  | 'microphone_unavailable'
  | 'microphone_failed'
  | 'settings_failed'
  | 'no_channel';

export interface VoiceError {
  code: VoiceErrorCode;
  /** Technical detail for logs/diagnostics; never shown verbatim. */
  message?: string;
  canAskAgain?: boolean;
  roomName?: string;
}

export type VoiceResult = { ok: true } | { ok: false; error: VoiceError };

export const voiceOk: VoiceResult = { ok: true };
export const voiceFail = (error: VoiceError): VoiceResult => ({ ok: false, error });
