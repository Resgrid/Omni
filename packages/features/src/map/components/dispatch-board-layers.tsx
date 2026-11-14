import type { DispatchMapOverlay } from '@resgrid/features/calls/lib/dispatch-board';
import { GeoJsonMapLayer, MapPins, MapPinType } from '@resgrid/maps';
import { MapMakerInfoData } from '@resgrid/models';
import React, { useMemo } from 'react';

export interface DispatchBoardLayersProps {
  overlay: DispatchMapOverlay;
  idPrefix?: string;
}

/** The board's placed resources as department-map pins: a dot in the status colour, labelled by name. */
const toPins = (overlay: DispatchMapOverlay): MapMakerInfoData[] =>
  overlay.points.features.map((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates;
    const pin = new MapMakerInfoData();

    pin.Id = feature.properties.id;
    pin.Longitude = longitude ?? 0;
    pin.Latitude = latitude ?? 0;
    pin.Title = feature.properties.name;
    pin.Color = feature.properties.color;
    pin.Type = feature.properties.kind === 'unit' ? MapPinType.Unit : MapPinType.Personnel;
    pin.InfoWindowContent = feature.properties.detail;

    return pin;
  });

/**
 * The nearest-unit board on a call map (Dispatch baseline location-picker overlay): station boundaries, then the available
 * units and personnel the board placed, in their status colours and labelled by name, drawn with the department map's own
 * layers. Only who can be sent is drawn; the dispatch picker lists everyone, with status, for reassignment.
 */
export const DispatchBoardLayers: React.FC<DispatchBoardLayersProps> = ({ overlay, idPrefix = 'dispatch-board' }) => {
  const pins = useMemo(() => toPins(overlay), [overlay]);

  return (
    <>
      <GeoJsonMapLayer id={`${idPrefix}-boundaries`} data={overlay.boundaries} fillOpacity={0.08} />
      {pins.length > 0 ? <MapPins pins={pins} canViewPersonnel showLabels idPrefix={`${idPrefix}-resources`} /> : null}
    </>
  );
};
