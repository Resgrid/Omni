import { useTranslation } from '@resgrid/i18n';
import { useCallback } from 'react';

import { type DistanceUnits, formatDistance } from '../engine/format';

/** "300 m", "1.2 km", "500 ft", "2.1 mi" through t() (number formatting and unit words per language). */
export const useDistanceText = (units: DistanceUnits): ((meters: number) => string) => {
  const { t } = useTranslation();
  return useCallback(
    (meters: number) => {
      const { value, unit } = formatDistance(meters, units);
      return t(`navigation.distance.${unit}`, { value });
    },
    [t, units]
  );
};
