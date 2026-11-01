import React from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { detectElectron } from './platform';

export type FormFactor = 'phone' | 'tablet' | 'desktop' | 'wall';

/** Breakpoints from omni-plan §5.4. */
export const FORM_FACTOR_BREAKPOINTS = {
  /** Shortest side at or above this is a tablet (below is a phone). */
  tabletMinShortestSide: 600,
  /** Web/Electron window width at or above this is a desktop. */
  desktopMinWidth: 1024,
  /** Window width above this is a wall board. */
  wallMinWidth: 1920,
} as const;

export interface FormFactorInfo {
  formFactor: FormFactor;
  width: number;
  height: number;
  isLandscape: boolean;
  /** Tablet-or-larger in landscape — the layout that gets permanent sidebars and multi-column boards. */
  isLandscapeBoard: boolean;
  isElectron: boolean;
  /** Running on web or Electron with a desktop-sized window (desktop or wall). */
  isDesktop: boolean;
  isPhone: boolean;
  isTablet: boolean;
  isWall: boolean;
}

export interface FormFactorOptions {
  /** Kiosk / wall-board mode (e.g. BigBoard on a TV): always 'wall'. */
  kiosk?: boolean;
}

interface ComputeInput extends FormFactorOptions {
  width: number;
  height: number;
  platform: typeof Platform.OS;
  isElectron: boolean;
}

/** Pure form-factor rule (omni-plan §5.4): phone < 600 shortest side ≤ tablet; desktop web/Electron ≥ 1024; wall > 1920 or kiosk. */
export function computeFormFactor({ width, height, platform, isElectron, kiosk = false }: ComputeInput): FormFactorInfo {
  const shortestSide = Math.min(width, height);
  const isWebLike = platform === 'web' || isElectron;
  const isLandscape = width > height;

  let formFactor: FormFactor;
  if (kiosk || width > FORM_FACTOR_BREAKPOINTS.wallMinWidth) {
    formFactor = 'wall';
  } else if (isWebLike && width >= FORM_FACTOR_BREAKPOINTS.desktopMinWidth) {
    formFactor = 'desktop';
  } else if (shortestSide >= FORM_FACTOR_BREAKPOINTS.tabletMinShortestSide) {
    formFactor = 'tablet';
  } else {
    formFactor = 'phone';
  }

  const isDesktop = isWebLike && (formFactor === 'desktop' || formFactor === 'wall');

  return {
    formFactor,
    width,
    height,
    isLandscape,
    isLandscapeBoard: formFactor !== 'phone' && isLandscape,
    isElectron,
    isDesktop,
    isPhone: formFactor === 'phone',
    isTablet: formFactor === 'tablet',
    isWall: formFactor === 'wall',
  };
}

const FormFactorOptionsContext = React.createContext<FormFactorOptions>({});

/** Sets form-factor options (e.g. `kiosk`) for a subtree — the app shell mounts it once from the variant. */
export function FormFactorProvider({ kiosk, children }: FormFactorOptions & { children?: React.ReactNode }) {
  const value = React.useMemo(() => ({ kiosk }), [kiosk]);
  return React.createElement(FormFactorOptionsContext.Provider, { value }, children);
}

/**
 * The current form factor, recomputed on resize/rotation. Use it instead of ad-hoc width checks
 * (Dispatch's column logic, IC's board layout hook, permanent sidebars, BigBoard's grid config).
 */
export function useFormFactor(options?: FormFactorOptions): FormFactorInfo {
  const context = React.useContext(FormFactorOptionsContext);
  const { width, height } = useWindowDimensions();
  const kiosk = options?.kiosk ?? context.kiosk ?? false;
  const isElectron = React.useMemo(() => detectElectron(), []);

  return React.useMemo(() => computeFormFactor({ width, height, platform: Platform.OS, isElectron, kiosk }), [width, height, isElectron, kiosk]);
}
