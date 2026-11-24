import { useTranslation } from '@resgrid/i18n';
import { MapLayersButton, MapLayersSheet, type MapLayerToggleItem } from '@resgrid/maps';
import React, { useMemo, useState } from 'react';

import type { DepartmentMapLayer } from '../hooks/use-department-layers';
import { type FacilityMapsState, facilitySheetSection } from '../hooks/use-facility-maps';
import type { MapOverlays } from '../hooks/use-map-overlays';
import { FacilityFeatureCard } from './facility-maps-overlay';

export interface MapLayersControlProps {
  /** The department layers the map draws (`useDepartmentLayers`). */
  departmentLayers: readonly DepartmentMapLayer[];
  onToggleLayer: (layerId: string) => void;
  /** The facility maps the map draws (`useFacilityMaps`). */
  facility: FacilityMapsState;
  side?: 'left' | 'right';
  bottomOffset?: number;
  testID?: string;
}

/**
 * The Layers button and sheet for a map that has no controls of its own (the Dispatch console, the IC maps): the
 * department layers and the facility maps, with the same session toggles as the Map screen. Rendered beside the `MapView`.
 */
export const MapLayersControl: React.FC<MapLayersControlProps> = ({ departmentLayers, onToggleLayer, facility, side = 'left', bottomOffset, testID = 'map-layers-control' }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const layers = useMemo<MapLayerToggleItem[]>(() => departmentLayers.map((layer) => ({ Id: layer.id, Name: layer.name, Color: layer.color || null })), [departmentLayers]);
  const toggles = useMemo(() => Object.fromEntries(departmentLayers.map((layer) => [layer.id, layer.isOn])), [departmentLayers]);

  return (
    <>
      <MapLayersButton side={side} bottomOffset={bottomOffset} onPress={() => setIsOpen(true)} testID={`${testID}-button`} />
      <MapLayersSheet isOpen={isOpen} onClose={() => setIsOpen(false)} layers={layers} toggles={toggles} onToggle={onToggleLayer} facilityMaps={facilitySheetSection(facility, t)} />
    </>
  );
};

export interface MapOverlayControlsProps {
  overlays: MapOverlays;
  side?: 'left' | 'right';
  bottomOffset?: number;
  /** Prefix of the button's and the room card's test ids. */
  testID: string;
}

/** Room for the card of a tapped room or region under the Layers button. */
const FEATURE_CARD_CLEARANCE = 96;

/** `useMapOverlays`' Layers button and sheet (with `maps.layers`) and the card of a tapped room or region. */
export const MapOverlayControls: React.FC<MapOverlayControlsProps> = ({ overlays, side, bottomOffset = 20, testID }) => (
  <>
    {overlays.enabled ? (
      <MapLayersControl
        departmentLayers={overlays.departmentLayers}
        onToggleLayer={overlays.toggleLayer}
        facility={overlays.facility}
        side={side}
        bottomOffset={bottomOffset + (overlays.tappedFeature ? FEATURE_CARD_CLEARANCE : 0)}
        testID={`${testID}-layers`}
      />
    ) : null}
    {overlays.tappedFeature ? <FacilityFeatureCard feature={overlays.tappedFeature} onClose={() => overlays.setTappedFeature(null)} testID={`${testID}-facility-feature`} /> : null}
  </>
);
