import { useTerm } from '@resgrid/auth';
import { useMapMarkersStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallResultData } from '@resgrid/models';
import { Expand, Map as MapIcon, RefreshCw } from 'lucide-react-native';
import React, { useMemo } from 'react';

import { ConsoleMap } from './console-map';
import { PanelFrame, PanelIconButton } from './panel-frame';

export interface MapPanelProps {
  /** The filtered call: the map flies to it. */
  selectedCall: CallResultData | null;
  /** Opens the full map screen; omitted when the variant has none. */
  onExpand?: () => void;
  /** Replaces the built-in MapLibre map (e.g. an app-supplied map with layers). */
  mapSlot?: React.ReactNode;
  flex?: number;
  maxHeight?: number;
}

const callPoint = (call: CallResultData | null): { latitude: number; longitude: number } | null => {
  if (!call) return null;
  const [lat, lon] = call.Latitude && call.Longitude ? [call.Latitude, call.Longitude] : (call.Geolocation ?? '').split(',');
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!lat || !lon || !Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) return null;
  return { latitude, longitude };
};

/** The console's map card (Dispatch baseline map widget): live department pins, refresh, and expand to the full map. */
export const MapPanel: React.FC<MapPanelProps> = ({ selectedCall, onExpand, mapSlot, flex, maxHeight }) => {
  const { t } = useTranslation();
  const title = useTerm('module.mapping', t('dispatch.map'));
  const focus = useMemo(() => callPoint(selectedCall), [selectedCall]);

  return (
    <PanelFrame
      title={title}
      icon={MapIcon}
      iconColor="#14b8a6"
      cardKey="map"
      flex={flex}
      maxHeight={maxHeight}
      testID="map-panel"
      right={
        <>
          <PanelIconButton icon={RefreshCw} onPress={() => void useMapMarkersStore.getState().fetchMarkers({ bypassCache: true })} accessibilityLabel={t('common.refresh')} testID="map-refresh" />
          {onExpand ? <PanelIconButton icon={Expand} onPress={onExpand} accessibilityLabel={t('dispatch_console.expand_map')} testID="map-expand" /> : null}
        </>
      }
    >
      {mapSlot ?? <ConsoleMap focus={focus} />}
    </PanelFrame>
  );
};
