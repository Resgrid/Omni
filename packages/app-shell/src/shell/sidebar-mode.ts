import type { VariantManifest } from '@resgrid/config';
import type { FormFactorInfo } from '@resgrid/ui';

/**
 * How the sidebar renders right now:
 * - `drawer` — modal side drawer opened from the header menu button;
 * - `permanent` — always-visible quarter-width column (Responder phones and tablets, Unit tablets, in landscape);
 * - `panel` — 280 px inline panel toggled by the menu button (Dispatch on desktop).
 */
export type SidebarMode = 'drawer' | 'permanent' | 'panel';

export type SidebarFormFactorKey = keyof VariantManifest['shell']['sidebar'];

/** Wall boards use the desktop setting. */
export const sidebarFormFactorKey = (formFactor: FormFactorInfo['formFactor']): SidebarFormFactorKey => (formFactor === 'phone' ? 'phone' : formFactor === 'tablet' ? 'tablet' : 'desktop');

/** The manifest's sidebar mode for this form factor (`shell.sidebar.{phone,tablet,desktop}`), resolved for orientation. */
export function resolveSidebarMode(shell: Pick<VariantManifest['shell'], 'sidebar'>, formFactor: Pick<FormFactorInfo, 'formFactor' | 'isLandscape'>): SidebarMode {
  const configured = shell.sidebar[sidebarFormFactorKey(formFactor.formFactor)];

  if (configured === 'permanent-landscape') {
    return formFactor.isLandscape ? 'permanent' : 'drawer';
  }

  if (configured === 'toggle-panel') {
    return 'panel';
  }

  return 'drawer';
}

/** The Dispatch panel width. */
export const PANEL_SIDEBAR_WIDTH = 280;

/**
 * The permanent column (Responder, Unit): a quarter of the window, plus the left safe-area inset, which the column pads.
 * Only a landscape phone has one (its notch or camera cutout on the left); the menu keeps its full quarter clear of it.
 */
export const permanentSidebarWidth = (windowWidth: number, leftInset: number): number => Math.round(windowWidth / 4) + leftInset;
