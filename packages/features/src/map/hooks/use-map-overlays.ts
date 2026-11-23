import { type CameraRef, useMapCapabilities } from '@resgrid/maps';
import { type RefObject, useState } from 'react';

import { type FacilityFeature, facilityMapKey } from '../lib/facility-maps';
import { type DepartmentMapLayer, useDepartmentLayers } from './use-department-layers';
import { type FacilityMapsState, useFacilityFocus, useFacilityMaps } from './use-facility-maps';

const NO_CAMERA: RefObject<CameraRef | null> = { current: null };

/** What a map without a screen of its own (the Dispatch console, the IC maps) overlays and lets the member switch. */
export interface MapOverlays {
  /** The variant's `maps.layers` (from the map provider). */
  enabled: boolean;
  departmentLayers: DepartmentMapLayer[];
  toggleLayer: (layerId: string) => void;
  facility: FacilityMapsState;
  /** The room or region tapped, while its map is still shown. */
  tappedFeature: FacilityFeature | null;
  setTappedFeature: (feature: FacilityFeature | null) => void;
}

/**
 * The department layers and the facility maps for a map that draws them with `DepartmentLayers` and
 * `FacilityMapsOverlay` and offers them with `MapOverlayControls`; the toggles are the Map screen's session toggles.
 * With the map's camera, a facility map switched on (or a floor chosen) is framed.
 */
export function useMapOverlays(cameraRef?: RefObject<CameraRef | null>): MapOverlays {
  const { layers: enabled } = useMapCapabilities();
  const { layers: departmentLayers, toggleLayer } = useDepartmentLayers(enabled);
  const facility = useFacilityMaps(enabled);
  useFacilityFocus(cameraRef ?? NO_CAMERA, facility);
  const [tapped, setTappedFeature] = useState<FacilityFeature | null>(null);
  // A room's card closes with its map (switched off in the Layers sheet).
  const tappedFeature = tapped && facility.layers.some((layer) => layer.key === facilityMapKey(tapped.kind, tapped.mapId)) ? tapped : null;

  return { enabled, departmentLayers, toggleLayer, facility, tappedFeature, setTappedFeature };
}
