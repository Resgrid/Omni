import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import type { TabItem } from './shared-tabs';

export interface RouteTab {
  /** Index of the selected tab in `tabs` (the first tab while the selected one is not in the list). */
  activeIndex: number;
  /** Key of the selected tab, if one was chosen. */
  activeKey: string | undefined;
  /** Select a tab by index (SharedTabs' `onChange`). */
  selectIndex: (index: number) => void;
}

/**
 * The selected tab of a tabbed screen, kept in the route's `tab` search param as well as in state.
 *
 * A tab kept only in component state is lost whenever the screen is rebuilt: Back to a screen its navigator let go of
 * (the drawer shells rendered routes through a Slot, which did that to every screen under a call or chat), a web
 * reload, a shared link. Route params stay in the navigation history and the URL, so the screen comes back on the tab
 * that was selected, and a link can open a given tab. A key that is not (yet) in `tabs` — a flag-gated tab still
 * loading — shows the first tab until it appears.
 */
export function useRouteTab(tabs: readonly Pick<TabItem, 'key'>[], param = 'tab'): RouteTab {
  const params = useLocalSearchParams<Record<string, string | string[] | undefined>>();
  const raw = params[param];
  const routeKey = Array.isArray(raw) ? raw[0] : raw;
  const [activeKey, setActiveKey] = useState<string | undefined>(routeKey);

  // A link to this screen with another tab (or Back to an entry that had one) moves the selection; one without a tab
  // goes back to the first.
  useEffect(() => {
    setActiveKey(routeKey);
  }, [routeKey]);

  const selectIndex = useCallback(
    (index: number) => {
      const key = tabs[index]?.key;

      if (key === undefined || key === activeKey) return;

      setActiveKey(key);
      router.setParams({ [param]: key });
    },
    [activeKey, param, tabs]
  );

  const index = tabs.findIndex((tab) => tab.key === activeKey);

  return { activeIndex: Math.max(index, 0), activeKey, selectIndex };
}
