import { useHeaderActions, useHref } from '@resgrid/app-shell';
import { DispatchConsoleScreen, ViewToggles } from '@resgrid/features/dispatch-console';
import React from 'react';

const HEADER_TOGGLES = <ViewToggles inHeader />;

/**
 * Dispatch's home: the console, with "Available only" / "Single list" in the shell's app bar (Dispatch's header) and the
 * map card's "expand" opening the department map (`/map`) only when the variant declares that route, so the button is
 * hidden instead of opening a dead link.
 */
export default function DispatchConsoleRoute() {
  const href = useHref();
  const map = href.map();
  useHeaderActions(HEADER_TOGGLES);
  return <DispatchConsoleScreen mapHref={map === null ? null : String(map)} showViewToggles={false} />;
}
