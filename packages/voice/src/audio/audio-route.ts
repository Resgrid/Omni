/** Platform-agnostic audio route helpers shared by the native and web routing leaves and the LiveKit store. */
export type AudioRouteTarget = 'bluetooth' | 'speaker' | 'earpiece' | 'default';

export interface AudioRouteSelection {
  /** The connected BLE/system Bluetooth audio device, when it carries audio. */
  connectedDevice: { hasAudioCapability: boolean } | null;
  speaker: { type: string } | null;
}

/**
 * Where call audio should go (Unit setupAudioRouting + Responder selection): a connected Bluetooth audio device wins,
 * then the user's speaker selection, otherwise the earpiece.
 */
export const resolveAudioRouteTarget = ({ connectedDevice, speaker }: AudioRouteSelection): Exclude<AudioRouteTarget, 'default'> => {
  if (connectedDevice?.hasAudioCapability) return 'bluetooth';
  if (speaker?.type === 'bluetooth') return 'bluetooth';
  if (speaker?.type === 'speaker') return 'speaker';
  return 'earpiece';
};
