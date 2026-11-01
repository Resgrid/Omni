import { useTranslation } from '@resgrid/i18n';
import type { MapMakerInfoData } from '@resgrid/models';
import { MapPin, Phone, Route } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isCallPin } from '../lib/pin-ids';
import { POI_MARKER_TYPE } from '../lib/poi';
import { useMapTheme } from '../provider/context';
import { MapSheet } from '../provider/overlays';
import { SheetButton, SheetHeader, SheetRow, sheetStyles } from './sheet-parts';

export interface PinDetailSheetProps {
  pin: MapMakerInfoData | null;
  isOpen: boolean;
  onClose: () => void;
  /** "Route" — the app opens directions (external hand-off or in-app navigation). */
  onRoute?: (pin: MapMakerInfoData) => void;
  onViewCall?: (pin: MapMakerInfoData) => void;
  onSetAsCurrentCall?: (pin: MapMakerInfoData) => void;
  onViewPoi?: (pin: MapMakerInfoData) => void;
}

/**
 * Details and actions for a tapped pin (baseline Unit pin-detail-modal). Navigation, toasts and stores stay in the
 * feature: every action is a callback, and an action without a callback is not shown.
 */
export const PinDetailSheet: React.FC<PinDetailSheetProps> = ({ pin, isOpen, onClose, onRoute, onViewCall, onSetAsCurrentCall, onViewPoi }) => {
  const { t } = useTranslation();
  const { colors } = useMapTheme();
  if (!pin) return null;
  const callPin = isCallPin(pin) || pin.ImagePath?.toLowerCase() === 'call';
  const poiPin = pin.Type === POI_MARKER_TYPE;
  const iconColor = colors.text;
  const run = (action: ((value: MapMakerInfoData) => void) | undefined) => () => {
    action?.(pin);
    onClose();
  };

  return (
    <MapSheet isOpen={isOpen} onClose={onClose} testID="pin-detail-sheet">
      <SheetHeader title={pin.Title} onClose={onClose} closeLabel={t('common.close')} testID="pin-detail" />
      <View style={styles.coordinates}>
        <View>
          <MapPin size={16} color={iconColor} />
        </View>
        <Text style={StyleSheet.flatten([styles.muted, { color: colors.mutedText }])} testID="pin-detail-coordinates">
          {pin.Latitude.toFixed(6)}, {pin.Longitude.toFixed(6)}
        </Text>
      </View>
      {pin.InfoWindowContent ? <Text style={StyleSheet.flatten([sheetStyles.section, styles.body, { color: colors.text }])}>{pin.InfoWindowContent}</Text> : null}
      {pin.Address ? <SheetRow label={t('map.pin_address')} value={pin.Address} testID="pin-detail-address" /> : null}
      {pin.Note ? <SheetRow label={t('map.pin_note')} value={pin.Note} /> : null}
      {pin.PoiTypeName ? <SheetRow label={t('map.pin_type')} value={pin.PoiTypeName} /> : null}
      {pin.Color ? (
        <View style={styles.colorRow}>
          <View style={StyleSheet.flatten([styles.swatch, { backgroundColor: pin.Color }])} />
          <Text style={StyleSheet.flatten([styles.muted, { color: colors.mutedText }])}>{t('map.pin_color')}</Text>
        </View>
      ) : null}
      <View style={StyleSheet.flatten([sheetStyles.divider, { backgroundColor: colors.border }])} />
      {onRoute ? <SheetButton label={t('common.route')} onPress={run(onRoute)} icon={<Route size={18} color={colors.primary} />} testID="pin-detail-route" /> : null}
      {callPin && onViewCall ? <SheetButton label={t('map.view_call_details')} onPress={run(onViewCall)} icon={<Phone size={18} color={colors.primary} />} testID="pin-detail-view-call" /> : null}
      {callPin && onSetAsCurrentCall ? (
        <SheetButton label={t('map.set_as_current_call')} onPress={run(onSetAsCurrentCall)} variant="solid" icon={<Phone size={18} color={colors.onPrimary} />} testID="pin-detail-set-current" />
      ) : null}
      {poiPin && onViewPoi ? <SheetButton label={t('map.view_poi_details')} onPress={run(onViewPoi)} icon={<MapPin size={18} color={colors.primary} />} testID="pin-detail-view-poi" /> : null}
    </MapSheet>
  );
};

const styles = StyleSheet.create({
  coordinates: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  muted: {
    marginLeft: 8,
    fontSize: 13,
  },
  body: {
    fontSize: 14,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
});
