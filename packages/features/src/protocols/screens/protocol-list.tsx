import { useProtocolsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallProtocolsResultData } from '@resgrid/models';
import { FlatList, Input, InputField, Loading, RefreshControl, ZeroState } from '@resgrid/ui';
import { BookOpen } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ProtocolCard } from '../components/protocol-card';
import { ProtocolDetailsSheet } from '../components/protocol-details-sheet';

/** Protocols search over name, code and description (plain text). */
export function searchProtocols(protocols: readonly CallProtocolsResultData[], query: string): CallProtocolsResultData[] {
  const needle = query.trim().toLowerCase();
  const enabled = protocols.filter((protocol) => !protocol.IsDisabled);
  if (!needle) return enabled;
  return enabled.filter((protocol) => `${protocol.Name} ${protocol.Code} ${protocol.Description}`.toLowerCase().includes(needle));
}

/** Department protocols (Unit/IC list + Responder extras); read from the persisted store, so it works offline. */
export default function ProtocolListScreen() {
  const { t } = useTranslation();
  const protocols = useProtocolsStore((state) => state.protocols);
  const isLoading = useProtocolsStore((state) => state.loading.protocols === true);
  const fetchProtocols = useProtocolsStore((state) => state.fetchProtocols);
  const fetchProtocol = useProtocolsStore((state) => state.fetchProtocol);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CallProtocolsResultData | null>(null);

  useEffect(() => {
    void fetchProtocols();
  }, [fetchProtocols]);

  const visible = useMemo(() => searchProtocols(protocols, query), [protocols, query]);

  const open = useCallback(
    (protocol: CallProtocolsResultData) => {
      setSelected(protocol);
      // The list may carry a trimmed protocol; the detail read fills in the full text when online.
      void fetchProtocol(protocol.Id).then((full) => {
        if (full) setSelected((current) => (current?.Id === full.Id ? full : current));
      });
    },
    [fetchProtocol]
  );

  return (
    <View style={styles.screen} className="bg-background-50" testID="protocol-list-screen">
      <View style={styles.search}>
        <Input variant="outline" size="md">
          <InputField value={query} onChangeText={setQuery} placeholder={t('protocols.search')} accessibilityLabel={t('protocols.search')} testID="protocol-search" />
        </Input>
      </View>
      <FlatList
        data={visible}
        keyExtractor={(item: CallProtocolsResultData) => item.Id}
        renderItem={({ item }: { item: CallProtocolsResultData }) => <ProtocolCard protocol={item} onPress={open} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void fetchProtocols({ bypassCache: true })} />}
        ListEmptyComponent={isLoading ? <Loading /> : <ZeroState icon={BookOpen} heading={t('protocols.empty')} description={t('protocols.emptyDescription')} testID="protocol-list-empty" />}
        testID="protocol-list"
      />
      <ProtocolDetailsSheet protocol={selected} isOpen={selected !== null} onClose={() => setSelected(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: { paddingHorizontal: 12, paddingTop: 12 },
  list: { padding: 12 },
});
