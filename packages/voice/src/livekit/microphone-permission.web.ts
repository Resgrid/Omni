import { logger } from '@resgrid/core';

import { errorName } from '../util/async';

export interface MicrophonePermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}

/**
 * Browser microphone permission (Dispatch livekit-store): prompt through getUserMedia and release the stream at once.
 * Only an explicit denial blocks joining; no microphone at all still joins listen-only.
 */
export async function ensureMicrophonePermission(): Promise<MicrophonePermissionResult> {
  const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!mediaDevices?.getUserMedia) {
    logger.warn({ message: 'MediaDevices API not available; joining listen-only' });
    return { granted: true, canAskAgain: true };
  }
  try {
    const stream = await mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { granted: true, canAskAgain: true };
  } catch (error) {
    const name = errorName(error);
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      logger.warn({ message: 'Microphone permission denied in the browser' });
      return { granted: false, canAskAgain: false };
    }
    logger.warn({ message: 'No usable microphone; joining listen-only', context: { name } });
    return { granted: true, canAskAgain: true };
  }
}
