import type { CallKeepService } from './types';
import { noopCallKeepService } from './types';

/** Web and Electron have no CallKit/ConnectionService: the browser keeps audio alive on its own. */
export function getCallKeepService(): CallKeepService {
  return noopCallKeepService;
}

export function resetCallKeepServiceForTests(): void {
  // Nothing cached on web.
}
