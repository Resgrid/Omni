import { useActiveVariant } from '@resgrid/config';
import React, { type ReactNode, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { completeOnboarding } from '../runtime/preferences';
import { setShellState } from '../runtime/shell-state';
import { type ShellScreenName, useShellScreens } from '../runtime/slots';
import { FALLBACK_SCREENS } from './fallback-screens';
import type { GateStep } from './gate-state';
import { useShellGateStep } from './use-gate-step';

const SCREEN_FOR_STEP: Record<Exclude<GateStep, 'app'>, ShellScreenName> = {
  loading: 'Loading',
  onboarding: 'Onboarding',
  login: 'Login',
  maintenance: 'Maintenance',
  'personal-lock': 'PersonalLock',
  'access-denied': 'AccessDenied',
  'shared-lock': 'SharedDeviceLock',
};

export interface ShellGateProps {
  children?: ReactNode;
  /** Overrides the computed step (tests, previews). */
  step?: GateStep;
}

/**
 * ShellGate (omni-plan §5.4): onboarding → login → maintenance → personal lock → app-access right → shared-device lock.
 * Renders the registered screen for the first gate that applies (a built-in fallback when none is registered), or the
 * app. It wraps the `(app)` group, so every protected route is gated and public routes (`sso-return`) stay outside.
 */
export function ShellGate({ children, step: forcedStep }: ShellGateProps) {
  const computedStep = useShellGateStep();
  const step = forcedStep ?? computedStep;
  const screens = useShellScreens();
  const variant = useActiveVariant();

  const onComplete = useCallback(() => {
    if (step === 'onboarding') {
      completeOnboarding();
    } else if (step === 'access-denied') {
      setShellState({ accessDeniedNotice: false });
    }
  }, [step]);

  if (step === 'app') {
    return <>{children}</>;
  }

  const name = SCREEN_FOR_STEP[step];
  const Screen = screens[name] ?? FALLBACK_SCREENS[name];
  return (
    <View style={styles.fill} testID="shell-gate">
      <Screen step={step} appName={variant.identity.name} onComplete={onComplete} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
