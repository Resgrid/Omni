import React, { createContext, useContext } from 'react';

import { HStack } from '../hstack';
import { Text } from '../text';
import { HeaderBackButton } from './header-back-button';

/**
 * Provided by a layout whose app bar shows its own back button for the current screen (the app shell, below the top
 * level with history). In-content headers then leave theirs out, so a screen never shows two back arrows.
 */
export const AppBarBackContext = createContext(false);

/** Whether the app bar above this screen already shows a back button. */
export const useAppBarShowsBack = (): boolean => useContext(AppBarBackContext);

export interface ScreenHeaderProps {
  title: string;
  /** Used when the app bar above has no back button (no history, or outside the app shell). */
  onBack: () => void;
  /** Optional trailing actions (icon buttons). */
  right?: React.ReactNode;
  testID?: string;
}

// Standard in-content header for detail screens living inside a layout that owns the app bar.
// A native Stack header there would replace that chrome, so detail screens render this row below it instead.
export const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, onBack, right, testID = 'screen-header' }) => {
  const appBarShowsBack = useAppBarShowsBack();
  return (
    <HStack className={appBarShowsBack ? 'min-h-12 items-center bg-background-0 px-4 py-1' : 'items-center bg-background-0 px-2 pb-2 pt-1'} space="sm" testID={testID}>
      {appBarShowsBack ? null : <HeaderBackButton onPress={onBack} />}
      <Text className="flex-1 text-lg font-bold text-typography-900" numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {right ?? null}
    </HStack>
  );
};
