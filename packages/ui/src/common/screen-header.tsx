import React from 'react';

import { HStack } from '../hstack';
import { Text } from '../text';
import { HeaderBackButton } from './header-back-button';

export interface ScreenHeaderProps {
  title: string;
  onBack: () => void;
  /** Optional trailing actions (icon buttons). */
  right?: React.ReactNode;
  testID?: string;
}

// Standard in-content header for detail screens living inside a layout that owns the app bar.
// A native Stack header there would replace that chrome, so detail screens render this row below it instead.
export const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, onBack, right, testID = 'screen-header' }) => (
  <HStack className="items-center bg-background-0 px-2 pb-2 pt-1" space="sm" testID={testID}>
    <HeaderBackButton onPress={onBack} />
    <Text className="flex-1 text-lg font-bold text-typography-900" numberOfLines={1} accessibilityRole="header">
      {title}
    </Text>
    {right ?? null}
  </HStack>
);
