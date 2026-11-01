import { REDACTION_VALUE } from '@resgrid/auth';
import { type ContactAddressData, type ContactResultData, ContactType } from '@resgrid/models';

// Pure presentation helpers for a contact (U/I baseline `lib/contacts/format`). Nothing here decides what a person may
// see: withheld values arrive redacted and are shown as protected by the screens.

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

/** Applies a removal until nothing changes, so markup nested inside markup cannot reassemble. */
const removeAll = (text: string, pattern: RegExp): string => {
  let previous: string;
  let current = text;
  do {
    previous = current;
    current = current.replace(pattern, '');
  } while (current !== previous);
  return current;
};

/** Rich text from the web editor as plain text: line breaks kept, markup and scripts dropped. */
export const htmlToText = (html: string | null | undefined): string => {
  if (!html) return '';
  const withoutBlocks = removeAll(html, /<(script|style)[^>]*>[\s\S]*?<\/\1>/gi)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  return removeAll(withoutBlocks, /<[^>]+>/g)
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** "lat,lng" (or "lat lng") as numbers, when it parses and is in range. */
export const parseCoordinates = (value: string | null | undefined): Coordinates | null => {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value ?? '');
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
};

/**
 * The name to show: a company's name, else the person's name, else what the server called it. Withheld parts are
 * dropped; when nothing but withheld parts remain the sentinel is returned whole, so the screen shows the protected
 * label rather than "REDACTED REDACTED".
 */
export const contactDisplayName = (contact: Pick<ContactResultData, 'ContactType' | 'CompanyName' | 'FirstName' | 'MiddleName' | 'LastName' | 'Name' | 'OtherName'>): string => {
  let withheld = false;
  const clean = (value: string | null | undefined): string => {
    if (value === REDACTION_VALUE) {
      withheld = true;
      return '';
    }
    return value?.trim() ?? '';
  };
  const person = [clean(contact.FirstName), clean(contact.LastName)].filter((part) => part !== '').join(' ');
  const company = clean(contact.CompanyName);
  const fallback = clean(contact.Name) || clean(contact.OtherName);
  const name = contact.ContactType === ContactType.Company ? company || person || fallback : person || company || fallback;
  return name || (withheld ? REDACTION_VALUE : '');
};

/** One-line address (the server's formatted line, else the parts). */
export const formatAddress = (address: ContactAddressData | null | undefined): string => {
  if (!address) return '';
  if (address.Formatted && address.Formatted.trim()) return address.Formatted.trim();
  return [address.Address1, [address.City, address.State].filter((part) => !!part).join(', '), address.PostalCode].filter((part) => !!part && String(part).trim() !== '').join(' ');
};

export type ContactAction = 'phone' | 'email' | 'website';

/** The URL a tap opens, or null when the value cannot make a safe one (websites: http/https only). */
export const contactActionUrl = (action: ContactAction, value: string | null | undefined): string | null => {
  const raw = value?.trim() ?? '';
  if (!raw) return null;
  switch (action) {
    case 'phone': {
      const digits = raw.replace(/[^0-9+]/g, '');
      return digits.length > 0 ? `tel:${digits}` : null;
    }
    case 'email':
      return /^[^\s@<>()]+@[^\s@<>()]+$/.test(raw) ? `mailto:${raw}` : null;
    case 'website': {
      const url = /^https?:\/\//i.test(raw) ? raw : /^[a-z][a-z0-9+.-]*:/i.test(raw) ? null : `https://${raw}`;
      return url && /^https?:\/\/[^\s]+$/i.test(url) ? url : null;
    }
    default:
      return null;
  }
};

/** Contacts list search: name, company, email, phones, category. */
export const contactMatches = (contact: ContactResultData, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [contactDisplayName(contact), contact.CompanyName, contact.Email, contact.CellPhoneNumber, contact.OfficePhoneNumber, contact.HomePhoneNumber, contact.CategoryName ?? contact.Category?.Name]
    .filter((value): value is string => typeof value === 'string' && value !== 'REDACTED')
    .some((value) => value.toLowerCase().includes(needle));
};
