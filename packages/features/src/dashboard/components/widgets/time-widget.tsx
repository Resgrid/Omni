import { useTranslation } from '@resgrid/i18n';
import { Text, View } from '@resgrid/ui';
import React from 'react';
import { StyleSheet } from 'react-native';

import { useNow } from '../../hooks/use-now';
import { useWidgetSettings } from '../../hooks/use-widget-settings-store';
import { formatClock, formatClockDate } from '../../lib/format';
import { WIDGET_LABEL_KEYS, WidgetTypes } from '../../lib/widget-types';
import { WidgetContainer } from '../widget-container';
import type { WidgetProps } from './types';

/** The device clock and date in the device locale (BigBoard ignored its own 24-hour and seconds settings; honoured now). */
export const TimeWidget: React.FC<WidgetProps> = ({ isEditMode, onRemove, onConfigure, height }) => {
  const { t, i18n } = useTranslation();
  const settings = useWidgetSettings('time');
  const now = useNow(settings.showSeconds ? 1000 : 10000);
  const date = new Date(now);
  // Scales with the cell so a 1×1 clock and a wall-height clock both read across the room.
  const clockSize = Math.max(20, Math.min(96, Math.round(height * 0.28)));

  return (
    <WidgetContainer title={t(WIDGET_LABEL_KEYS[WidgetTypes.TIME])} testID="time-widget" isEditMode={isEditMode} onRemove={onRemove} onConfigure={onConfigure}>
      <View style={styles.center} accessible accessibilityLiveRegion="none">
        <Text className="font-bold text-typography-900" style={{ fontSize: clockSize }} numberOfLines={1} adjustsFontSizeToFit testID="time-widget-clock">
          {formatClock(date, settings, i18n.language)}
        </Text>
        <Text className="text-sm text-typography-600" numberOfLines={1} testID="time-widget-date">
          {formatClockDate(date, i18n.language)}
        </Text>
      </View>
    </WidgetContainer>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
