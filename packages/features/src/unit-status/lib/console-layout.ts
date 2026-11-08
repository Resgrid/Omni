import type { FormFactorInfo } from '@resgrid/ui';

/** `standard`: phone drawer and tablet sidebar · `mdt`: Electron/desktop mobile data terminal (gloved hands, a moving vehicle). */
export type ConsoleDensity = 'standard' | 'mdt';

export interface ConsoleMetrics {
  density: ConsoleDensity;
  /** Minimum height of a status button and of every console action (touch target). */
  buttonMinHeight: number;
  /** Status button label size (NativeWind class). */
  labelClassName: string;
  /** Status buttons per row on the full-screen console. */
  statusColumns: number;
  /** Side-by-side columns on the full-screen console (status buttons | unit, call, crew). */
  twoColumn: boolean;
  iconSize: number;
}

/**
 * Console sizing per form factor (omni-plan §5.4, §7.11 "Electron MDT"): an MDT (Electron or a desktop-sized window)
 * gets 64 px targets, larger labels and a multi-column status grid; tablets in landscape split into two columns.
 */
export function consoleMetrics(info: Pick<FormFactorInfo, 'isElectron' | 'isDesktop' | 'isLandscapeBoard' | 'isWall'>): ConsoleMetrics {
  const mdt = info.isElectron || info.isDesktop || info.isWall;

  if (mdt) return { density: 'mdt', buttonMinHeight: 64, labelClassName: 'text-lg font-bold', statusColumns: 3, twoColumn: true, iconSize: 24 };

  return { density: 'standard', buttonMinHeight: 48, labelClassName: 'text-base font-semibold', statusColumns: info.isLandscapeBoard ? 2 : 1, twoColumn: info.isLandscapeBoard, iconSize: 18 };
}

/** The smallest a unit card round button gets to keep its row on one line (its hit slop still makes a 44 pt target). */
export const MIN_ROUND_BUTTON_SIZE = 24;

/**
 * Size of `count` round buttons that share one row `rowWidth` wide, each in a slot with `slotMargin` on either side: the
 * preferred size, shrunk until they fit (never below {@link MIN_ROUND_BUTTON_SIZE}). A row not measured yet (0) keeps it.
 */
export function fitRoundButtonSize(preferred: number, rowWidth: number, count: number, slotMargin: number): number {
  if (rowWidth <= 0 || count <= 0) return preferred;
  const fits = Math.floor(rowWidth / count) - slotMargin * 2;

  return Math.max(MIN_ROUND_BUTTON_SIZE, Math.min(preferred, fits));
}
