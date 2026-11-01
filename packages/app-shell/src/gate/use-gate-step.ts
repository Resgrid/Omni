import { checkAppAccess, isPersonalLockEnabled, personalLockStore, securityStore, useAuthStore, useSharedSessionStore } from '@resgrid/auth';
import { useActiveVariant } from '@resgrid/config';
import { getEnv } from '@resgrid/core';
import { useMemo, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { startupInit } from '../init/app-init';
import { getAppShellOptions } from '../runtime/shell-config';
import { useShellStore } from '../runtime/shell-state';
import { type GateInputs, type GateStep, resolveGateStep } from './gate-state';

const startupReadySnapshot = (): boolean => startupInit.getStatus().everReady;

/** Live inputs for the ShellGate state machine, from the auth stores, the variant and the shell's own state. */
export function useGateInputs(): GateInputs {
  const variant = useActiveVariant();
  const startupReady = useSyncExternalStore(startupInit.subscribe, startupReadySnapshot, startupReadySnapshot);
  const status = useAuthStore((state) => state.status);
  const accessToken = useAuthStore((state) => state.accessToken);
  const authMethod = useAuthStore((state) => state.authMethod);
  const onboardingStored = useShellStore((state) => state.onboardingRequired);
  const accessDeniedNotice = useShellStore((state) => state.accessDeniedNotice);
  const personalLockFlag = personalLockStore((state) => state.isLocked);
  const rights = securityStore((state) => state.rights);
  const sharedLockedFlag = useSharedSessionStore((state) => state.locked);

  return useMemo(() => {
    const capabilities = variant.capabilities;
    const signedIn = status === 'signedIn' && !!accessToken;
    const onboardingPlatform = Platform.OS !== 'web' || getAppShellOptions().onboardingOnWeb === true;
    let maintenance = false;
    try {
      maintenance = capabilities.platform.maintenanceMode && getEnv().MAINTENANCE_MODE;
    } catch {
      maintenance = false;
    }
    return {
      startupReady,
      onboardingRequired: capabilities.platform.onboarding && onboardingPlatform && (onboardingStored === true || status === 'onboarding'),
      signedIn,
      accessDeniedNotice,
      maintenance,
      // The lock applies to password sessions on personal devices only (isPersonalLockEnabled re-checks the rest).
      personalLocked: signedIn && capabilities.auth.personalLock && personalLockFlag && authMethod === 'password' && isPersonalLockEnabled(),
      appAccess: signedIn ? checkAppAccess(rights) : 'unknown',
      sharedLocked: signedIn && capabilities.auth.sharedDevice && sharedLockedFlag,
    };
  }, [variant, startupReady, status, accessToken, authMethod, onboardingStored, accessDeniedNotice, personalLockFlag, rights, sharedLockedFlag]);
}

export function useShellGateStep(): GateStep {
  return resolveGateStep(useGateInputs());
}
