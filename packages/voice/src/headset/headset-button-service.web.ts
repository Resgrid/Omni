import type { HeadsetButtonService, HeadsetButtonType, HeadsetMonitorOwner, MediaButtonKeyEvent } from './types';

/** Web/Electron: no MediaSession bridge; desktop PTT uses the keyboard hotkey instead (see desktop/). */
const webHeadsetButtonService: HeadsetButtonService = {
  isSupported: false,
  startMonitoring: (_owner?: HeadsetMonitorOwner) => undefined,
  stopMonitoring: (_owner?: HeadsetMonitorOwner) => undefined,
  isMonitoringActive: () => false,
  handleKeyEvent: (_event: MediaButtonKeyEvent) => undefined,
  handleButton: (_type: HeadsetButtonType, _phase?: 'down' | 'up') => undefined,
  destroy: () => undefined,
};

export function getHeadsetButtonService(): HeadsetButtonService {
  return webHeadsetButtonService;
}

export function resetHeadsetButtonServiceForTests(): void {
  // Stateless on web.
}
