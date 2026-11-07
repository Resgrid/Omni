import { readableColors } from '@resgrid/features/status';
import { useTranslation } from '@resgrid/i18n';
import { HStack, Text, View } from '@resgrid/ui';
import { CloudOff } from 'lucide-react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import type { UnitStatusDisplay } from '../lib/status-display';

export interface CurrentStatusTileProps {
  /** Null without an active unit: the tile reads "Unknown", as legacy Unit's did. */
  status: UnitStatusDisplay | null;
  testID?: string;
}

/** A status the department gave no colour keeps the card's neutral surface (and its themed text). */
const NO_COLOR = '';

/**
 * The unit's current status in the sidebar (Unit `status-sidebar`): a card filled with the department's status colour
 * and the status name in black or white, whichever reads on it, beside the unit card. A newer status still waiting in
 * the outbox shows instead, with a "pending sync" marker. Destination and time in status are on the full console.
 */
export const CurrentStatusTile: React.FC<CurrentStatusTileProps> = ({ status, testID = 'unit-status-tile' }) => {
  const { t } = useTranslation();
  const display = status?.pendingText || status?.text || t('common.unknown');
  const isPending = status ? status.isPending || !!status.pendingText : false;
  // An unreadable colour falls back to NO_COLOR as well.
  const { backgroundColor, textColor } = readableColors(status?.color, NO_COLOR);
  const hasColor = backgroundColor !== NO_COLOR;

  return (
    <View
      className="rounded-xl border border-outline-100 bg-background-50 p-3"
      style={StyleSheet.flatten([styles.tile, hasColor ? { backgroundColor, borderColor: backgroundColor } : null])}
      accessibilityLabel={isPending ? `${t('status.current_status')}: ${display}, ${t('status.pending_sync')}` : `${t('status.current_status')}: ${display}`}
      testID={testID}
    >
      <Text className="font-semibold text-typography-900" style={hasColor ? { color: textColor } : undefined} numberOfLines={2} testID={`${testID}-text`}>
        {display}
      </Text>
      {isPending ? (
        <HStack space="xs" className="mt-1 items-center" testID={`${testID}-pending`}>
          <View>
            <CloudOff size={12} color={hasColor ? textColor : '#d97706'} />
          </View>
          <Text className="text-xs" style={{ color: hasColor ? textColor : '#d97706' }} numberOfLines={1}>
            {t('status.pending_sync')}
          </Text>
        </HStack>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  tile: { flex: 1, justifyContent: 'center' },
});
