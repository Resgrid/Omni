import { isWidgetType, type WidgetType } from './lib/widget-types';

/**
 * Dashboard routes (BigBoard): the board is the variant's home (`shell.homeRoute` `/home`, legacy `(app)/home`), the
 * configure screen keeps BigBoard's `(app)/configure`. `?widget=` opens Configure on one widget type's settings.
 */
export const DASHBOARD_ROUTE_PATTERNS = {
  home: '/home',
  configure: '/configure',
} as const;

export const dashboardRoutes = {
  home: (): string => '/home',
  configure: (widget?: WidgetType | null): string => {
    if (widget === undefined || widget === null) return '/configure';
    if (!isWidgetType(widget)) throw new Error('Unknown dashboard widget type');
    return `/configure?widget=${encodeURIComponent(widget)}`;
  },
} as const;

/** The widget a Configure link asks for (`?widget=`), or null for anything that is not a known widget type. */
export const parseConfigureWidgetParam = (value: string | string[] | null | undefined): WidgetType | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  return isWidgetType(raw) ? raw : null;
};
