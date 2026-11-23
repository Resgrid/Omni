import { useIsFocused } from 'expo-router';
import React, { createContext, useContext, useEffect, useId } from 'react';

import { HStack } from '../hstack';
import { Text } from '../text';
import { HeaderBackButton } from './header-back-button';

/**
 * How the app bar above the current screen lets the user leave it, from the app shell:
 * - `back`: it shows a back button (a screen below the top level, with history);
 * - `menu`: the screen is a top-level destination (a menu or tab entry, or the home), which has nothing to go back to:
 *   the menu button or the permanent sidebar leads elsewhere, and a form keeps its own Cancel;
 * - `none`: neither — no app bar (outside the shell), or a screen below the top level with no history (a deep link, a
 *   web reload), whose own back knows where it belongs.
 *
 * In-content headers leave the bar to do its job, so a screen never shows two back arrows or two titles.
 */
export type AppBarExit = 'back' | 'menu' | 'none';

export const AppBarExitContext = createContext<AppBarExit>('none');

/** How the app bar above this screen lets the user leave it (`AppBarExit`). */
export const useAppBarExit = (): AppBarExit => useContext(AppBarExitContext);

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
  /**
   * Used only when the app bar offers no way out (`AppBarExit` `none`: outside the app shell, or below the top level with
   * no history); a top-level screen in the shell is left through the menu, a detail screen through the bar's back.
   */
  onBack: () => void;
  /** Optional trailing actions (icon buttons). */
  right?: React.ReactNode;
  testID?: string;
}

/**
 * Titles the app bar (and gives it `right`) while the calling screen is focused: tabs and the drawer shell's stack keep
 * other screens mounted, and only the visible one may title the bar. A null title leaves the bar to the shell (its nav
 * entry's label); so does a screen outside the app shell.
 */
export function useAppBarTitle(title: string | null, right?: React.ReactNode): void {
  const slot = useContext(AppBarTitleSlotContext);
  const owner = useId();
  const isFocused = useIsFocused();
  const shows = isFocused && title !== null;

  useEffect(() => {
    if (slot && isFocused && title !== null) slot.show(owner, { title, right });
  }, [isFocused, owner, right, slot, title]);

  useEffect(() => (slot && shows ? () => slot.hide(owner) : undefined), [shows, owner, slot]);
}

/** Puts the header into the app bar while its screen is focused (`useAppBarTitle`). */
function AppBarScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  useAppBarTitle(title, right);

  return null;
}

/**
 * Standard header for detail and form screens. Inside the app shell, when the app bar covers leaving the screen (its back
 * button, or the menu of a top-level screen such as Dispatch's New Call), the screen's title and actions go into the app
 * bar: one header, not two. Otherwise — below the top level with no history, or outside the shell — it is a row with its
 * own back button, since a native Stack header would replace the layout's chrome.
 */
export const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, onBack, right, testID = 'screen-header' }) => {
  const exit = useAppBarExit();
  const slot = useContext(AppBarTitleSlotContext);
  const hasOwnBack = exit === 'none';

  if (!hasOwnBack && slot) return <AppBarScreenHeader title={title} right={right} />;

  return (
    <HStack className={hasOwnBack ? 'items-center bg-background-0 px-2 pb-2 pt-1' : 'min-h-12 items-center bg-background-0 px-4 py-1'} space="sm" testID={testID}>
      {hasOwnBack ? <HeaderBackButton onPress={onBack} /> : null}
      <Text className="flex-1 text-lg font-bold text-typography-900" numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {right ?? null}
    </HStack>
  );
};
