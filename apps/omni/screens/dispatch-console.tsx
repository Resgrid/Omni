import { useHref } from '@resgrid/app-shell';
import { DispatchConsoleScreen } from '@resgrid/features/dispatch-console';
import React from 'react';

/**
 * Dispatch's home: the console, with the map card's "expand" opening the department map (`/map`) only when the variant
 * declares that route, so the button is hidden instead of opening a dead link.
 */
export default function DispatchConsoleRoute() {
  const href = useHref();
  const map = href.map();
  return <DispatchConsoleScreen mapHref={map === null ? null : String(map)} />;
}
