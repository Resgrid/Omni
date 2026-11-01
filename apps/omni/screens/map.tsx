import { useHref } from '@resgrid/app-shell';
import { MapScreen, type MapScreenLinks } from '@resgrid/features/map';
import type { Href } from 'expo-router';
import React, { useMemo } from 'react';

const toPath = (href: Href | null): string | null => (href === null ? null : String(href));

/**
 * The department map (`/map`) with its pin actions linked through this variant's route contract: a detail screen the
 * variant does not have (Unit has no unit or member pages) yields null and the action is hidden, never a dead link.
 */
export default function MapRoute() {
  const href = useHref();
  const links = useMemo<MapScreenLinks>(
    () => ({
      callDetail: (callId) => toPath(href.callDetail(callId)),
      unitDetail: (unitId) => toPath(href.unitDetail(unitId)),
      personnelDetail: (userId) => toPath(href.personnelDetail(userId)),
      poiDetail: (poiId) => toPath(href.poiDetail(poiId)),
      customMaps: () => toPath(href.maps()),
      searchMaps: () => toPath(href.mapsSearch()),
    }),
    [href]
  );
  return <MapScreen links={links} />;
}
