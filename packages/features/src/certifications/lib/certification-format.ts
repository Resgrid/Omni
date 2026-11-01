import type { DataError } from '@resgrid/data';
import { type Certification, CertificationStatus } from '@resgrid/models';

/** Text tone for an expiry: expired red, within 60 days amber, otherwise muted. */
export const expiryTone = (days?: number | null, status?: number): string => {
  if (status === CertificationStatus.Expired || (days != null && days < 0)) return 'text-error-600';
  if (days != null && days <= 60) return 'text-warning-600';
  return 'text-typography-500';
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar-day string (yyyy-MM-dd) that names a real day. */
export const isDateKey = (value: string): boolean => DATE_KEY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** An optional calendar-day field: blank is null, anything else must be yyyy-MM-dd. */
export const optionalDate = (value: string): { ok: boolean; value: string | null } => {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  return isDateKey(trimmed) ? { ok: true, value: trimmed } : { ok: false, value: null };
};

/** Continuing-education hours as typed ("1,5" allowed), rounded to 2 places; null unless greater than 0. */
export const hoursOf = (text: string): number | null => {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
};

/** A certification's calendar day field for display/input (the wire may append a time). */
export const dayOf = (value: string | null | undefined): string => String(value ?? '').slice(0, 10);

/** Soonest expiry first; records that never expire last; then by name. */
export const sortCertifications = (items: readonly Certification[]): Certification[] =>
  [...items].sort((a, b) => (a.ExpiresOn ?? '9999').localeCompare(b.ExpiresOn ?? '9999') || (a.TypeName ?? a.Name ?? '').localeCompare(b.TypeName ?? b.Name ?? ''));

/** The record's display name: catalog type, own name, or a generic label. */
export const certificationName = (item: Pick<Certification, 'TypeName' | 'Name'>, fallback: string): string => item.TypeName || item.Name || fallback;

/**
 * The translation key for a certifications failure: protected data needs unlocking, the module's own reasons
 * (`certifications_*` problem types, e.g. a photo that is too large) have their own text, everything else uses the
 * data layer's message.
 */
export const certificationErrorKey = (error: DataError): string => {
  if (error.problemType === 'protected_data_required') return 'certifications.errors.locked';
  if (error.problemType === 'certifications_file_invalid' || error.problemType === 'certifications_file_too_large') return `certifications.errors.${error.problemType}`;
  return error.messageKey;
};
