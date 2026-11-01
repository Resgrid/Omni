import { fetchDataProtectionCapabilities } from './data-protection/grant-store';
import { featureFlagsStore } from './flags/feature-flags-store';
import { type AppAccessDecision, checkAppAccess } from './rights/app-access';
import { securityStore } from './rights/security-store';
import { terminologyStore } from './terminology/terminology-store';

export interface SessionGatesResult {
  appAccess: AppAccessDecision;
}

/**
 * The gating part of the signed-in bootstrap (omni-plan §5.4 init steps): rights first — they decide the department the
 * flags and names are keyed by (Unit fetched flags in parallel, keyed without a department) — then feature flags,
 * terminology and the data-protection capabilities together. Every step keeps its persisted state on failure, so an
 * offline start gates exactly as the last online one did. The shell runs the app-access gate (`enforceAppAccess`) on the
 * result.
 */
export async function loadSessionGates(): Promise<SessionGatesResult> {
  await securityStore.getState().getRights();
  await Promise.allSettled([featureFlagsStore.getState().fetchFlags(), terminologyStore.getState().fetchTerminology(), fetchDataProtectionCapabilities()]);
  return { appAccess: checkAppAccess() };
}
