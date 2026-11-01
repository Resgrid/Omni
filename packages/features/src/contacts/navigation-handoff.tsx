import { logger } from '@resgrid/core/logging/logger';
import React, { createContext, useContext, useMemo } from 'react';
import { Linking, Platform } from 'react-native';

/**
 * Hand-off to a navigation app for directions (omni-plan §7.10 "Navigation hand-off"). The app shell provides the
 * department/user's chosen app (R/U/I 10-app hand-off) through `NavigationHandoffProvider`; until then the platform
 * default opens. The app never calls a routing provider itself — it hands the destination to the user's app.
 */
export type NavigationTarget = { latitude: number; longitude: number; label?: string } | { address: string; label?: string };

export interface NavigationHandoff {
  navigateTo: (target: NavigationTarget) => Promise<boolean>;
}

const encode = (value: string): string => encodeURIComponent(value);

/** The platform default maps URL for a target (Apple Maps, the Android geo intent, Google Maps on web/desktop). */
export const defaultNavigationUrl = (target: NavigationTarget, os: string = Platform.OS): string => {
  const query = 'address' in target ? encode(target.address) : `${target.latitude},${target.longitude}`;
  if (os === 'ios') return 'address' in target ? `maps://?daddr=${query}` : `maps://?daddr=${query}&dirflg=d`;
  if (os === 'android') return 'address' in target ? `geo:0,0?q=${query}` : `google.navigation:q=${query}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${query}`;
};

const defaultHandoff: NavigationHandoff = {
  navigateTo: async (target) => {
    const url = defaultNavigationUrl(target);
    try {
      await Linking.openURL(url);
      return true;
    } catch (error) {
      logger.warn({ message: 'Could not open a navigation app', context: { error: error instanceof Error ? error.message : 'unknown' } });
      return false;
    }
  },
};

const NavigationHandoffContext = createContext<NavigationHandoff>(defaultHandoff);

export function NavigationHandoffProvider({ value, children }: { value: NavigationHandoff; children?: React.ReactNode }) {
  const memo = useMemo(() => value, [value]);
  return <NavigationHandoffContext.Provider value={memo}>{children}</NavigationHandoffContext.Provider>;
}

export const useNavigationHandoff = (): NavigationHandoff => useContext(NavigationHandoffContext);
