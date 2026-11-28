import type { ProtocolLibraryEntry } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallProtocolsResultData } from '@resgrid/models';
import { htmlToPlainText, Pressable, Text } from '@resgrid/ui';
import { BookOpen } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { protocolKindKey } from '../lib/protocol-library';

export interface ProtocolCardProps {
  protocol: CallProtocolsResultData;
  /** Kind, number and version in force (protocols plan P1); absent from older servers. */
  entry?: ProtocolLibraryEntry;
  onPress: (protocol: CallProtocolsResultData) => void;
}

/** A protocol row: name, code, kind and version stamp, and a plain-text preview of the description (no HTML in list rows). */
export const ProtocolCard: React.FC<ProtocolCardProps> = ({ protocol, entry, onPress }) => {
  const { t } = useTranslation();
  const preview = useMemo(() => (protocol.Description ? htmlToPlainText(protocol.Description) : ''), [protocol.Description]);
  const meta = [protocol.Code, entry?.Number, entry ? t(protocolKindKey(entry.Kind)) : null, entry?.VersionLabel ? t('protocols.version_label', { label: entry.VersionLabel }) : null].filter(Boolean).join(' · ');

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
          {meta ? (
            <Text size="xs" className="text-typography-500" testID={`protocol-card-${protocol.Id}-meta`}>
              {meta}
            </Text>
          ) : null}
          {preview ? (
            <Text size="sm" className="mt-1 text-typography-600" numberOfLines={2}>
              {preview}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 10 },
  body: { flex: 1 },
});
