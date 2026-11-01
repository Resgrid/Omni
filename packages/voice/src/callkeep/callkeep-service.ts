import { getVoiceCapabilities } from '../capabilities';
import type { CallKeepService } from './types';
import { noopCallKeepService } from './types';

let instance: CallKeepService | null = null;

/**
 * The CallKeep service for this app: the native implementation only when the variant declares
 * `capabilities.voice.callKeep` (R/U/I) on iOS/Android; otherwise a no-op, so Dispatch/BigBoard never load
 * react-native-callkeep (it is not linked in those builds).
 */
export function getCallKeepService(): CallKeepService {
  if (instance) return instance;
  if (!getVoiceCapabilities().callKeep) return noopCallKeepService;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createNativeCallKeepService } = require('./callkeep-native') as { createNativeCallKeepService: () => CallKeepService };
  instance = createNativeCallKeepService();
  return instance;
}

/** Test helper: drops the cached implementation. Not for app code. */
export function resetCallKeepServiceForTests(): void {
  instance = null;
}
