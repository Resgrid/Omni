import { useTranslation } from '@resgrid/i18n';
import { HStack, Pressable, ScrollView, Text } from '@resgrid/ui';
import React from 'react';

import { AVAILABILITY_CLASSES, type AvailabilityClass } from '../lib/base-types';

export type AvailabilityFilter = Exclude<AvailabilityClass, 'unknown'> | 'all';

export interface AvailabilityFilterChipsProps {
  value: AvailabilityFilter;
  onChange: (value: AvailabilityFilter) => void;
  testID?: string;
}

const KEYS: Record<AvailabilityFilter, string> = {
  all: 'status.availability.all',
  available: 'status.availability.available',
  delayed: 'status.availability.delayed',
  committed: 'status.availability.committed',
  unavailable: 'status.availability.unavailable',
};

/** All / Available / Delayed / Committed / Unavailable — filters units and personnel by what their status MEANS. */
export const AvailabilityFilterChips: React.FC<AvailabilityFilterChipsProps> = ({ value, onChange, testID = 'availability-filter' }) => {
  const { t } = useTranslation();
  const options: AvailabilityFilter[] = ['all', ...AVAILABILITY_CLASSES];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID={testID}>
      <HStack space="sm" className="py-1">
        {options.map((option) => (
          <Pressable
            key={option}
            testID={`${testID}-${option}`}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected: option === value }}
            className={`rounded-full px-3 py-1.5 ${option === value ? 'bg-primary-500' : 'bg-background-100'}`}
          >
            <Text className={`text-sm font-medium ${option === value ? 'text-typography-0' : 'text-typography-700'}`}>{t(KEYS[option])}</Text>
          </Pressable>
        ))}
      </HStack>
    </ScrollView>
  );
};
