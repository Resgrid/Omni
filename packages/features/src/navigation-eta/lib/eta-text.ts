import type { NavigationEta } from '@resgrid/data';

/** The translate function the helpers need (i18next's `t`, or a test stand-in). */
export type EtaTranslate = (key: string, options?: Record<string, unknown>) => string;

export interface EtaTextOptions {
  /** Add "traffic" when the ETA came from a traffic-aware route (chips: yes; compact map labels: no). */
  traffic?: boolean;
  /** Add the "no update" marker when the report is stale (default true). */
  stale?: boolean;
}

/** "ETA 4 min" / "Arriving" — the minutes left, counted down between reports. */
export const navigationEtaMinutesText = (t: EtaTranslate, eta: Pick<NavigationEta, 'minutes'>): string => (eta.minutes > 0 ? t('navigation_eta.minutes', { count: eta.minutes }) : t('navigation_eta.arriving'));

/** The parts a chip shows, in order: minutes, then "traffic", then "no update" when stale. */
export function navigationEtaParts(t: EtaTranslate, eta: Pick<NavigationEta, 'minutes' | 'isTrafficAware' | 'isStale'>, options: EtaTextOptions = {}): string[] {
  const parts = [navigationEtaMinutesText(t, eta)];
  if (options.traffic !== false && eta.isTrafficAware) parts.push(t('navigation_eta.traffic'));
  if (options.stale !== false && eta.isStale) parts.push(t('navigation_eta.stale'));
  return parts;
}

/** "ETA 4 min · traffic" (the chip text), or the compact form with `{ traffic: false }`. */
export const navigationEtaText = (t: EtaTranslate, eta: Pick<NavigationEta, 'minutes' | 'isTrafficAware' | 'isStale'>, options?: EtaTextOptions): string => navigationEtaParts(t, eta, options).join(' · ');
