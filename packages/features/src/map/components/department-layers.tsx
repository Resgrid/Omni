import { GeoJsonMapLayer, OfflineDepartmentLayers, useMapCapabilities } from '@resgrid/maps';
import React, { useMemo } from 'react';

import { type DepartmentMapLayer, useDepartmentLayers } from '../hooks/use-department-layers';

export interface DepartmentLayersProps {
  /** The department layers (`useDepartmentLayers`); only the ones that are on are drawn. */
  layers: readonly DepartmentMapLayer[];
  /** The variant's `maps.layers`: off, the offline department data draws nothing either. */
  enabled: boolean;
  /** Style ids of the online layers are `${layerIdPrefix}-${layer.id}`. */
  layerIdPrefix: string;
  /** Style ids of the offline department data layers (`offlineDepartmentLayerIds(offlineIdPrefix)` finds them). */
  offlineIdPrefix: string;
  /** Name labels under point shapes (vendors, stops). */
  showLabels?: boolean;
  onFeaturePress?: (layer: DepartmentMapLayer, features: readonly GeoJSON.Feature[]) => void;
}

/**
 * The department map layers / geofences that are on (`IsOnByDefault`, which Core turns on while an event layer's event
 * runs, unless the member toggled it): each layer's GeoJSON once fetched, then from the offline department data the
 * layers whose GeoJSON is not on the device (§19.2; with no layer list on the device, the on-by-default ones). Every map
 * that shows the department draws its layers through this, so an imported KML/KMZ/GeoJSON layer looks the same on all.
 */
export const DepartmentLayers: React.FC<DepartmentLayersProps> = ({ layers, enabled, layerIdPrefix, offlineIdPrefix, showLabels = true, onFeaturePress }) => {
  const offlineLayerIds = useMemo(() => (layers.length > 0 ? layers.filter((layer) => layer.isOn).map((layer) => layer.id) : null), [layers]);
  const onlineLayerIds = useMemo(() => layers.filter((layer) => layer.isOn && layer.data).map((layer) => layer.id), [layers]);

  if (!enabled) return null;

  return (
    <>
      {layers.map((layer) =>
        layer.isOn && layer.data ? (
          <GeoJsonMapLayer
            key={layer.id}
            id={`${layerIdPrefix}-${layer.id}`}
            data={layer.data}
            color={layer.color}
            showLabels={showLabels}
            onFeaturePress={onFeaturePress ? (_feature, features) => onFeaturePress(layer, features) : undefined}
          />
        ) : null
      )}
      <OfflineDepartmentLayers visibleLayerIds={offlineLayerIds} excludeLayerIds={onlineLayerIds} showLabels={showLabels} idPrefix={offlineIdPrefix} />
    </>
  );
};

export interface DepartmentLayersOverlayProps {
  /** Prefix for the style ids this overlay adds to its map (unique per map). */
  idPrefix: string;
  showLabels?: boolean;
}

/**
 * The department layers for a map that has no layers sheet of its own (Dispatch console, BigBoard map widget): the
 * layers the department switched on, plus the member's own toggles from the Map screen this session. Rendered inside a
 * `MapView`; reads `maps.layers` from the map provider.
 */
export const DepartmentLayersOverlay: React.FC<DepartmentLayersOverlayProps> = ({ idPrefix, showLabels = true }) => {
  const { layers: enabled } = useMapCapabilities();
  const { layers } = useDepartmentLayers(enabled);

  return <DepartmentLayers layers={layers} enabled={enabled} layerIdPrefix={`${idPrefix}-layer`} offlineIdPrefix={`${idPrefix}-offline-layers`} showLabels={showLabels} />;
};
