import type { MapMakerInfoData } from '@resgrid/models';
import { getPinEntityId, MAP_PIN_TYPE } from '@resgrid/realtime';

/**
 * Puts a navigating unit's ETA under its map label: the pin's `Title` (what the pin layer draws as its label) gains a
 * second line. Only unit pins with a label change; every other pin — and the whole array when nothing changes — keeps
 * its identity, so the pin layer is rebuilt only when an ETA is actually on the map. Draw these pins; keep looking up
 * selection, focus and details on the undecorated ones (a hand-off to a navigation app must get the plain name).
 */
export function withNavigationEtaLabels(pins: readonly MapMakerInfoData[], labelOf: (unitId: string) => string | null): readonly MapMakerInfoData[] {
  let changed = false;
  const next = pins.map((pin) => {
    if (pin.Type !== MAP_PIN_TYPE.Unit) return pin;
    const label = labelOf(getPinEntityId(pin));
    if (!label) return pin;
    changed = true;
    return { ...pin, Title: pin.Title ? `${pin.Title}\n${label}` : label };
  });
  return changed ? next : pins;
}
