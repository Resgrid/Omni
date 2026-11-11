export interface StatusHoldInput {
  /** The department's "Hold to set status" (config `StatusHoldToConfirm`). */
  departmentEnabled: boolean;
  /** The app's `capabilities.status.holdToConfirm` (Responder and Unit). */
  appAllowsHold: boolean;
  /** Running as the iOS or Android app (phone or tablet), not web or Electron. */
  isNativeApp: boolean;
}

/**
 * Whether status buttons need the 2-second hold: only in the mobile apps that set status in the field (Responder, Unit
 * on iOS and Android) when the department turned it on. Dispatch, IC, BigBoard and every web or Electron build set
 * status straight away, so a desk is never slowed down (owner decision, plan §15 #24).
 */
export const statusHoldApplies = ({ departmentEnabled, appAllowsHold, isNativeApp }: StatusHoldInput): boolean => departmentEnabled && appAllowsHold && isNativeApp;
