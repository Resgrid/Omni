import { useTranslation } from '@resgrid/i18n';
import type { Certification } from '@resgrid/models';
import { useCallback } from 'react';

import { expiryState, formatDay } from '../lib/certification-format';

/** A record's expiry line: "Expired {date}", "Expires today", "Expires {date}" or "Does not expire". */
export function useExpiryText(): (item: Pick<Certification, 'ExpiresOn' | 'DaysUntilExpiry' | 'Status'>) => string {
  const { t, i18n } = useTranslation();
  const locale = i18n?.language ?? 'en';
  return useCallback(
    (item) => {
      const state = expiryState(item);
      if (state === 'none') return t('certifications.noExpiry');
      const date = formatDay(item.ExpiresOn, locale);
      if (state === 'expired') return item.ExpiresOn ? t('certifications.expired', { date }) : t('certifications.status.1');
      return item.DaysUntilExpiry === 0 ? t('certifications.expiresToday') : t('certifications.expires', { date });
    },
    [locale, t]
  );
}
