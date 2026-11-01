import { HStack, Text, VStack } from '@resgrid/ui';
import React from 'react';

export interface RouteStat {
  id: string;
  label: string;
  value: string;
}

/** A row of route figures (stops, distance, duration…); empty values are left out. */
export const RouteStats: React.FC<{ stats: readonly RouteStat[]; testID?: string }> = ({ stats, testID = 'route-stats' }) => (
  <HStack space="sm" className="flex-wrap" testID={testID}>
    {stats
      .filter((stat) => stat.value !== '')
      .map((stat) => (
        <VStack key={stat.id} className="mb-2 items-center rounded-lg bg-background-50 px-4 py-2" testID={`${testID}-${stat.id}`}>
          <Text className="text-lg font-bold text-primary-600">{stat.value}</Text>
          <Text className="text-xs text-typography-500">{stat.label}</Text>
        </VStack>
      ))}
  </HStack>
);
