/**
 * Personnel rows carry the department's status/staffing colour, but older servers (and the built-in sets) send a
 * Bootstrap label class ("label-danger") instead of a colour. Responder's home cards mapped those inline twice; this is
 * the one copy, used by the home status and staffing cards.
 */
const LABEL_COLORS: Record<string, string> = {
  'label-danger': '#EF4444',
  'label-info': '#3B82F6',
  'label-warning': '#F59E0B',
  'label-success': '#10B981',
  'label-onscene': '#10B981',
  'label-primary': '#3B82F6',
  'label-returning': '#6B7280',
  'label-default': '#374151',
  'label-enroute': '#10B981',
};

export const DEFAULT_LABEL_COLOR = '#6B7280';

/** A drawable colour for a server colour value: label classes map to the design palette; blank falls back to grey. */
export const labelColor = (value: string | null | undefined, fallback = DEFAULT_LABEL_COLOR): string => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return fallback;
  const mapped = LABEL_COLORS[trimmed.toLowerCase()];
  if (mapped) return mapped;
  if (trimmed.toLowerCase().startsWith('label-')) return fallback;
  // React Native only draws a hex colour that has its leading #.
  return /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(trimmed) ? `#${trimmed}` : trimmed;
};
