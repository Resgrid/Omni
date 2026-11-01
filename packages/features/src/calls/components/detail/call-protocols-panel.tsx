import { useTranslation } from '@resgrid/i18n';
import type { CallProtocolsResultData } from '@resgrid/models';
import { Text } from '@resgrid/ui';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ProtocolContent } from '../../../protocols';

export interface CallProtocolsPanelProps {
  protocols: readonly CallProtocolsResultData[];
}

/** Protocols attached to the call; protocol text renders through the protocols feature (HtmlRenderer only). */
export const CallProtocolsPanel: React.FC<CallProtocolsPanelProps> = ({ protocols }) => {
  const { t } = useTranslation();
  if (protocols.length === 0) {
    return (
      <View style={styles.panel} testID="call-protocols-panel">
        <Text className="text-typography-600">{t('call_detail.no_protocols')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.panel} testID="call-protocols-panel">
      {protocols.map((protocol) => (
        <View key={protocol.Id || protocol.Name} style={styles.item} className="bg-background-50">
          <ProtocolContent protocol={protocol} testID={`call-protocol-${protocol.Id}`} />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { padding: 16 },
  item: { borderRadius: 8, padding: 12, marginBottom: 12 },
});
