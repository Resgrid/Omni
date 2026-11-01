import { useMemo } from 'react';

import type { RealtimeHubKey } from '../constants';
import { type HubSnapshot, type RealtimeHubOutages, type RealtimeState, useRealtimeStore } from '../realtime-store';

export interface RealtimeStatus {
  hubs: Readonly<Record<RealtimeHubKey, HubSnapshot>>;
  outages: RealtimeHubOutages;
  /** The eventing hub is in its department group: live updates are flowing. */
  isLive: boolean;
  /** A hub that was live has gone quiet (eventing or chat). */
  hasOutage: boolean;
  /** Earliest outage start (epoch ms), null when none. The banner waits out its grace period from here. */
  outageSince: number | null;
  /** An outage spent every reconnection attempt: show the banner now, the hub waits for the network. */
  isExhausted: boolean;
}

/** Pure derivation, usable outside React (e.g. desktop notifications). */
export function getRealtimeStatus(state: Pick<RealtimeState, 'hubs' | 'outages'>): RealtimeStatus {
  const outages = Object.values(state.outages).filter((outage): outage is NonNullable<typeof outage> => outage !== undefined);
  return {
    hubs: state.hubs,
    outages: state.outages,
    isLive: state.hubs.eventing.joined,
    hasOutage: outages.length > 0,
    outageSince: outages.length > 0 ? Math.min(...outages.map((outage) => outage.since)) : null,
    isExhausted: outages.some((outage) => outage.exhausted),
  };
}

/** Hub states and outages for the realtime status banner and connection indicators. */
export function useRealtimeStatus(): RealtimeStatus {
  const hubs = useRealtimeStore((state) => state.hubs);
  const outages = useRealtimeStore((state) => state.outages);
  return useMemo(() => getRealtimeStatus({ hubs, outages }), [hubs, outages]);
}
