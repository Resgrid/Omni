// Web and Electron: no in-app OTA updates — a web redeploy and the Electron auto-updater ship new code there — so
// @resgrid/core's updates service gets no module and stays off, and expo-updates never enters the web bundle.
// iOS/Android: app-updates.native.ts (docs/subsystems/app-updates.md).
import type { UpdatesModule } from '@resgrid/core';

export const appUpdatesModule: UpdatesModule | null = null;
