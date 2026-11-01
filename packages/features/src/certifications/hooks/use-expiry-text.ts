import { useTranslation } from '@resgrid/i18n';
import type { Certification } from '@resgrid/models';
import { useCallback } from 'react';

import { dayOf } from '../lib/certification-format';

/** A record's expiry line: "Expired {date}", "Expires {date} ({days} days)" or "Does not expire". */
export function useExpiryText(): (item: Pick<Certification, 'ExpiresOn' | 'DaysUntilExpiry'>) => string {
  const { t } = useTranslation();
  return useCallback(
    (item) => {
      if (!item.ExpiresOn) return t('certifications.noExpiry');
      const date = dayOf(item.ExpiresOn);
      return item.DaysUntilExpiry != null && item.DaysUntilExpiry < 0 ? t('certifications.expired', { date }) : t('certifications.expires', { date, days: item.DaysUntilExpiry ?? '' });
    },
    [t]
  );
}
