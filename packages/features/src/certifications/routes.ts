import { isNumericRouteId, routePathWithId, routePathWithQuery } from '@resgrid/core/navigation/route-paths';

/** The member's own certifications (Responder `/certifications`, `/certifications/[id]`, `/certifications/edit`). */
export const CERTIFICATIONS_ROUTE_PATTERNS = {
  list: '/certifications',
  detail: '/certifications/[id]',
  edit: '/certifications/edit',
} as const;

/** Certification ids are numeric; anything else could build a path outside the module, so it builds none (null, reported). */
export const certificationsRoutes = {
  list: (): string => '/certifications',
  detail: (id: number | string): string | null => routePathWithId('certifications.detail', id, (certificationId) => `/certifications/${certificationId}`, isNumericRouteId),
  /** Add (no id) or edit an existing record. */
  edit: (id?: number | string | null): string | null => routePathWithQuery('certifications.edit', '/certifications/edit', { id }, isNumericRouteId),
} as const;

/** A route parameter as a certification id, or null when it is not one. */
export const parseCertificationId = (value: string | string[] | null | undefined): number | null => {
  const text = Array.isArray(value) ? value[0] : value;
  if (!text || !/^\d+$/.test(text.trim())) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
