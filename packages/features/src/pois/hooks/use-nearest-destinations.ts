import { usePoisStore } from '@resgrid/data';
import type { NearestDestinationResultData } from '@resgrid/models';
import { useEffect, useState } from 'react';

import { type DestinationOrigin, isUsablePoint } from '../lib/poi-availability';

export interface UseNearestDestinationsOptions {
  origin: DestinationOrigin | null | undefined;
  capabilityId?: string | null;
  /** The travelling unit, so its travel mode and vehicle limits apply. */
  unitId?: string | number | null;
  /** Off while the list is not shown: nothing is asked for. */
  enabled: boolean;
}

/** What `useNearestDestinations` returns. */
export interface NearestDestinationsState {
  /** The server's ranking, best first; null while loading, when off, or when the server could not answer. */
  ranking: NearestDestinationResultData[] | null;
  isLoading: boolean;
}

/**
 * The server's ranking of destinations from an origin (`GET /Mapping/GetNearestDestinations`): drive times for the closest,
 * availability first. Null while loading, when off, without an origin, or when the server could not answer; callers then
 * rank by straight line (`rankDestinations`). A newer origin or capability cancels the older request.
 */
export function useNearestDestinations({ origin, capabilityId = null, unitId = null, enabled }: UseNearestDestinationsOptions): NearestDestinationsState {
  const [ranking, setRanking] = useState<NearestDestinationResultData[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const usable = enabled && !!origin && isUsablePoint(origin.latitude, origin.longitude);
  // About 10 m: a GPS fix wandering on the spot does not ask again.
  const latitudeKey = usable && origin ? origin.latitude.toFixed(4) : '';
  const longitudeKey = usable && origin ? origin.longitude.toFixed(4) : '';

  useEffect(() => {
    if (!usable) {
      setRanking(null);
      setIsLoading(false);

      return;
    }

    const controller = new AbortController();

    setIsLoading(true);
    setRanking(null);
    void usePoisStore
      .getState()
      .fetchNearestDestinations({ latitude: Number(latitudeKey), longitude: Number(longitudeKey), capabilityId, unitId, take: 50 }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setRanking(result);
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [capabilityId, latitudeKey, longitudeKey, unitId, usable]);

  return { ranking, isLoading };
}
