import { useIsFocused } from 'expo-router';
import React, { createContext, useContext, useEffect, useId } from 'react';

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

/** What a screen shows in the app bar: its title and trailing actions. */
export interface AppBarScreenTitle {
  title: string;
  right?: React.ReactNode;
}

/**
 * Provided by the app shell: a screen's header takes over the app bar's title and actions instead of drawing a second
 * header row under it. `show` sets (or updates) one screen's entry, `hide` removes it; the newest shown entry wins.
 */
export interface AppBarTitleSlot {
  show: (owner: string, header: AppBarScreenTitle) => void;
  hide: (owner: string) => void;
}

export const AppBarTitleSlotContext = createContext<AppBarTitleSlot | null>(null);

export interface ScreenHeaderProps {
  title: string;
  /** Used when the app bar above has no back button (no history, or outside the app shell). */
  onBack: () => void;
  /** Optional trailing actions (icon buttons). */
  right?: React.ReactNode;
  testID?: string;
}

/**
 * Puts the header into the app bar while its screen is focused: tabs and the drawer shell's stack keep other screens
 * mounted, and only the visible one may title the bar.
 */
function AppBarScreenHeader({ slot, title, right }: { slot: AppBarTitleSlot; title: string; right?: React.ReactNode }) {
  const owner = useId();
  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) slot.show(owner, { title, right });
  }, [isFocused, owner, right, slot, title]);

  useEffect(() => (isFocused ? () => slot.hide(owner) : undefined), [isFocused, owner, slot]);

  return null;
}

/**
 * Standard header for detail screens. Inside the app shell, with the app bar showing back, the screen's title and actions
 * go into the app bar (one header, not two). Otherwise — no history, or outside the shell — it is a row with its own back
 * button, since a native Stack header would replace the layout's chrome.
 */
export const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, onBack, right, testID = 'screen-header' }) => {
  const appBarShowsBack = useAppBarShowsBack();
  const slot = useContext(AppBarTitleSlotContext);

  if (appBarShowsBack && slot) return <AppBarScreenHeader slot={slot} title={title} right={right} />;

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
