import type { VariantManifest } from '@resgrid/config';
import type { FormFactorInfo } from '@resgrid/ui';

/**
 * How the sidebar renders right now:
 * - `drawer` — modal side drawer opened from the header menu button;
 * - `permanent` — always-visible quarter-width column (Responder/Unit tablets in landscape);
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

/** Permanent quarter-width column (Responder/Unit), the Dispatch panel width. */
export const PERMANENT_SIDEBAR_WIDTH = '25%';
export const PANEL_SIDEBAR_WIDTH = 280;
