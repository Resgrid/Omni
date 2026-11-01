import type { VariantManifest } from '@resgrid/config';
import { type FormFactorInfo, useFormFactor } from '@resgrid/ui';
import React, { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { resolveSidebarMode, type SidebarMode } from './sidebar-mode';

/**
 * Shell state for the signed-in app (replaces BigBoard's DrawerContext and pathname checks): menu open/close, whether
 * the sidebar is permanent, the form factor, and the header actions slot.
 *
 * Note for features: this context depends only on React and @resgrid/ui types so it can move to @resgrid/ui (L5) —
 * features (L6) cannot import @resgrid/app-shell (L7).
 */
export interface ShellContextValue {
  variant: VariantManifest;
  formFactor: FormFactorInfo;
  sidebarMode: SidebarMode;
  isSidebarPermanent: boolean;
  /** Drawer open (drawer mode) or panel shown (panel mode). Always false for a permanent sidebar. */
  isMenuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
  /** Puts actions in the header (right side); pass null to clear. Prefer `useHeaderActions`. */
  setHeaderActions: (actions: ReactNode | null) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);
const HeaderActionsContext = createContext<ReactNode | null>(null);

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (!value) {
    throw new Error('useShell must be used inside the app shell (createAppShell).');
  }
  return value;
}

export const useOptionalShell = (): ShellContextValue | null => useContext(ShellContext);

/** The current header actions (rendered by the shell header). */
export const useHeaderActionsNode = (): ReactNode | null => useContext(HeaderActionsContext);

/** Shows `actions` in the header while the calling screen is mounted (BigBoard's gear, Dispatch's view toggles). */
export function useHeaderActions(actions: ReactNode | null): void {
  const shell = useOptionalShell();
  const setHeaderActions = shell?.setHeaderActions;
  useEffect(() => {
    if (!setHeaderActions) {
      return undefined;
    }
    setHeaderActions(actions);
    return () => setHeaderActions(null);
  }, [actions, setHeaderActions]);
}

export interface ShellProviderProps {
  variant: VariantManifest;
  children?: ReactNode;
}

export function ShellProvider({ variant, children }: ShellProviderProps) {
  const formFactor = useFormFactor();
  const sidebarMode = resolveSidebarMode(variant.shell, formFactor);
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [headerActions, setHeaderActionsState] = useState<ReactNode | null>(null);

  // Rotating into a permanent sidebar (or out of the panel) must not leave a modal drawer open over the content
  // (Responder's rotation bug).
  useEffect(() => {
    setMenuOpen(false);
  }, [sidebarMode]);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), []);
  const setHeaderActions = useCallback((actions: ReactNode | null) => setHeaderActionsState(actions), []);

  const value = useMemo<ShellContextValue>(
    () => ({
      variant,
      formFactor,
      sidebarMode,
      isSidebarPermanent: sidebarMode === 'permanent',
      isMenuOpen: sidebarMode === 'permanent' ? false : isMenuOpen,
      openMenu,
      closeMenu,
      toggleMenu,
      setHeaderActions,
    }),
    [variant, formFactor, sidebarMode, isMenuOpen, openMenu, closeMenu, toggleMenu, setHeaderActions]
  );

  return (
    <ShellContext.Provider value={value}>
      <HeaderActionsContext.Provider value={headerActions}>{children}</HeaderActionsContext.Provider>
    </ShellContext.Provider>
  );
}
