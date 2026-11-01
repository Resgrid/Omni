import type { MapMakerInfoData } from '@resgrid/models';

import type { MapWidgetSettings } from './widget-settings';

/** Core pin types (`MapMakerInfoData.Type`). */
export const PIN_TYPE = { Call: 0, Unit: 1, Station: 2, Personnel: 3 } as const;

/** The pins the map widget draws: the pin kinds the board turned off are dropped (BigBoard ignored these settings). */
export function filterMapPins(pins: readonly MapMakerInfoData[], settings: Pick<MapWidgetSettings, 'showCalls' | 'showUnits' | 'showStations' | 'showPersonnel'>): MapMakerInfoData[] {
  return pins.filter((pin) => {
    if (!Number.isFinite(pin.Latitude) || !Number.isFinite(pin.Longitude) || (pin.Latitude === 0 && pin.Longitude === 0)) return false;
    switch (pin.Type) {
      case PIN_TYPE.Call:
        return settings.showCalls;
      case PIN_TYPE.Unit:
        return settings.showUnits;
      case PIN_TYPE.Station:
        return settings.showStations;
      case PIN_TYPE.Personnel:
        return settings.showPersonnel;
      default:
        return true;
    }
  });
}

/** Where the map opens when it is not fitting every pin: the widget's own centre, else the department's, else null. */
export function resolveWidgetCenter(
  settings: Pick<MapWidgetSettings, 'latitude' | 'longitude'>,
  departmentCenter: { latitude?: number | string | null; longitude?: number | string | null } | null
): [number, number] | null {
  if (settings.latitude !== 0 || settings.longitude !== 0) return [settings.longitude, settings.latitude];
  const latitude = Number(departmentCenter?.latitude ?? 0);
  const longitude = Number(departmentCenter?.longitude ?? 0);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [longitude, latitude] : null;
}
