import { useTranslation } from '@resgrid/i18n';
import type { CallProtocolsResultData } from '@resgrid/models';
import { htmlToPlainText, Pressable, Text } from '@resgrid/ui';
import { BookOpen, ChevronRight } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

export interface ProtocolCardProps {
  protocol: CallProtocolsResultData;
  onPress: (protocol: CallProtocolsResultData) => void;
}

/** A protocol row: name, code and a plain-text preview of the description (no HTML in list rows). */
export const ProtocolCard: React.FC<ProtocolCardProps> = ({ protocol, onPress }) => {
  const { t } = useTranslation();
  const preview = useMemo(() => (protocol.Description ? htmlToPlainText(protocol.Description) : ''), [protocol.Description]);
  return (
    <Pressable
      onPress={() => onPress(protocol)}
      accessibilityRole="button"
      accessibilityLabel={protocol.Code ? `${protocol.Name}, ${protocol.Code}` : protocol.Name}
      accessibilityHint={t('protocols.open_hint')}
      testID={`protocol-card-${protocol.Id}`}
      className="mb-2 rounded-xl border border-outline-100 bg-background-0 p-3"
    >
      <View style={styles.row}>
        <View style={styles.icon}>
          <BookOpen size={20} color="#2563EB" />
        </View>
        <View style={styles.body}>
          <Text className="font-semibold text-typography-900">{protocol.Name}</Text>
          {protocol.Code ? (
            <Text size="xs" className="text-typography-500">
              {protocol.Code}
            </Text>
          ) : null}
          {preview ? (
            <Text size="sm" className="mt-1 text-typography-600" numberOfLines={2}>
              {preview}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={18} color="#9CA3AF" />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 10 },
  body: { flex: 1 },
});
