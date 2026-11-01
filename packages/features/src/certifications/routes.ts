/** The member's own certifications (Responder `/certifications`, `/certifications/[id]`, `/certifications/edit`). */
export const CERTIFICATIONS_ROUTE_PATTERNS = {
  list: '/certifications',
  detail: '/certifications/[id]',
  edit: '/certifications/edit',
} as const;

/** Certification ids are numeric; anything else could build a path outside the module. */
const encodeId = (id: number | string): string => {
  const text = String(id).trim();
  if (!/^\d+$/.test(text)) throw new Error('Unsafe certification route id');
  return text;
};

export const certificationsRoutes = {
  list: (): string => '/certifications',
  detail: (id: number | string): string => `/certifications/${encodeId(id)}`,
  /** Add (no id) or edit an existing record. */
  edit: (id?: number | string | null): string => (id === undefined || id === null ? '/certifications/edit' : `/certifications/edit?id=${encodeId(id)}`),
} as const;

/** A route parameter as a certification id, or null when it is not one. */
export const parseCertificationId = (value: string | string[] | null | undefined): number | null => {
  const text = Array.isArray(value) ? value[0] : value;
  if (!text || !/^\d+$/.test(text.trim())) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};
