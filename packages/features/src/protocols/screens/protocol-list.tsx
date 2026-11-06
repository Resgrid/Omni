import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { useProtocolsStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { CallProtocolsResultData } from '@resgrid/models';
import { FlatList, Input, InputField, Loading, RefreshControl, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { BookOpen } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ProtocolCard } from '../components/protocol-card';
import { protocolRoutes } from '../routes';

/** Protocols search over name, code and description (plain text). */
export function searchProtocols(protocols: readonly CallProtocolsResultData[], query: string): CallProtocolsResultData[] {
  const needle = query.trim().toLowerCase();
  const enabled = protocols.filter((protocol) => !protocol.IsDisabled);
  if (!needle) return enabled;
  return enabled.filter((protocol) => `${protocol.Name} ${protocol.Code} ${protocol.Description}`.toLowerCase().includes(needle));
}

/** Department protocols (Unit/IC list + Responder extras); read from the persisted store, so it works offline. A protocol opens as its own page. */
export default function ProtocolListScreen() {
  const { t } = useTranslation();
  const protocols = useProtocolsStore((state) => state.protocols);
  const isLoading = useProtocolsStore((state) => state.loading.protocols === true);
  const fetchProtocols = useProtocolsStore((state) => state.fetchProtocols);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void fetchProtocols();
  }, [fetchProtocols]);

  const visible = useMemo(() => searchProtocols(protocols, query), [protocols, query]);

  const open = useCallback((protocol: CallProtocolsResultData) => pushRoutePath(router, protocolRoutes.protocolDetail(protocol.Id)), []);

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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: { paddingHorizontal: 12, paddingTop: 12 },
  list: { padding: 12 },
});
