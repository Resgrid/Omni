/**
 * Seam between PTT inputs (headset media buttons, BLE handsets, desktop hotkey) and the LiveKit store. The store registers
 * itself here when it is created; inputs only depend on this interface, which keeps the package free of the import
 * cycles the legacy apps worked around with lazy `require('@/stores/app/livekit-store')`.
 */
export type PttInputSource = 'ui' | 'headset' | 'bluetooth' | 'desktop' | 'callkeep';

export interface MicrophoneController {
  /** A room is connected (transmitting is possible). */
  isActive(): boolean;
  /** A connect is in flight (inputs retry briefly instead of dropping the press). */
  isConnecting(): boolean;
  isMicrophoneEnabled(): boolean;
  setMicrophoneEnabled(enabled: boolean, source: PttInputSource): Promise<void>;
  toggleMicrophone(source: PttInputSource): Promise<void>;
}

let controller: MicrophoneController | null = null;

export function registerMicrophoneController(next: MicrophoneController | null): void {
  controller = next;
}

export function getMicrophoneController(): MicrophoneController | null {
  return controller;
}
