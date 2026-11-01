import type { FormFactorInfo } from '@resgrid/ui';

/**
 * The console layout by form factor (omni-plan §5.4 replaces Dispatch's width checks):
 * - `three-column`: desktop/Electron/wall, or a tablet in landscape — calls + resources | map + activity | people + PTT;
 * - `two-column`: a tablet in portrait;
 * - `single-column`: phones — one scrolling column with height-bounded panels.
 */
export type ConsoleLayout = 'three-column' | 'two-column' | 'single-column';

export const resolveConsoleLayout = (info: Pick<FormFactorInfo, 'formFactor' | 'isLandscape'>): ConsoleLayout => {
  if (info.formFactor === 'desktop' || info.formFactor === 'wall') return 'three-column';
  if (info.formFactor === 'tablet') return info.isLandscape ? 'three-column' : 'two-column';
  return 'single-column';
};
