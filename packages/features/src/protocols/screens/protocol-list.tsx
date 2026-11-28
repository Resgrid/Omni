import { useCapability } from '@resgrid/config';
import { pushRoutePath } from '@resgrid/core/navigation/route-paths';
import { isAcknowledgmentOwed, useProtocolAcknowledgmentsStore, useProtocolsStore } from '@resgrid/data';
import { OptionChips } from '@resgrid/features/calls/components/option-chips';
import { useTranslation } from '@resgrid/i18n';
import type { CallProtocolsResultData } from '@resgrid/models';
import { FlatList, Input, InputField, Loading, RefreshControl, SharedTabs, useRouteTab, ZeroState } from '@resgrid/ui';
import { router } from 'expo-router';
import { BookOpen } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AcknowledgmentList } from '../components/acknowledgment-list';
import { ProtocolCard } from '../components/protocol-card';
import { categoriesInLibrary, filterLibrary, kindsInLibrary, protocolKindKey } from '../lib/protocol-library';
import { protocolRoutes } from '../routes';

/** Protocols search over name, code and description (plain text), enabled protocols only. */
export function searchProtocols(protocols: readonly CallProtocolsResultData[], query: string): CallProtocolsResultData[] {
  return filterLibrary(protocols, {}, query);
}

/** The library: search, kind chips (when the department uses more than one kind) and each protocol's version in force. */
const ProtocolLibrary: React.FC = () => {
  const { t } = useTranslation();
  const protocols = useProtocolsStore((state) => state.protocols);
  const library = useProtocolsStore((state) => state.libraryById);
  const categories = useProtocolsStore((state) => state.categories);
  const isLoading = useProtocolsStore((state) => state.loading.protocols === true);
  const fetchProtocols = useProtocolsStore((state) => state.fetchProtocols);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);

  useEffect(() => {
    void fetchProtocols();
    void useProtocolsStore.getState().fetchCategories();
  }, [fetchProtocols]);

  const kinds = useMemo(() => kindsInLibrary(library, protocols), [library, protocols]);
  const kindOptions = useMemo(() => kinds.map((value) => ({ value, label: t(protocolKindKey(value)) })), [kinds, t]);
  const categoryOptions = useMemo(() => categoriesInLibrary(categories, library).map((category) => ({ value: category.CategoryId, label: category.Name ?? '' })), [categories, library]);
  const showKinds = kindOptions.length > 1;
  // A filter applies only while its chip is on screen to remove it: after a refresh drops the picked kind or category (or
  // hides the chips), the library shows unfiltered and the stale pick is cleared.
  const activeKind = showKinds && kind !== null && kinds.includes(kind) ? kind : null;
  const activeCategoryId = categoryId !== null && categoryOptions.some((option) => option.value === categoryId) ? categoryId : null;
  const visible = useMemo(() => filterLibrary(protocols, library, query, activeKind, activeCategoryId), [protocols, library, query, activeKind, activeCategoryId]);

  useEffect(() => {
    if (kind !== null && activeKind === null) setKind(null);
  }, [activeKind, kind]);

  useEffect(() => {
    if (categoryId !== null && activeCategoryId === null) setCategoryId(null);
  }, [activeCategoryId, categoryId]);

  const open = useCallback((protocol: CallProtocolsResultData) => pushRoutePath(router, protocolRoutes.protocolDetail(protocol.Id)), []);

  const refresh = useCallback(async () => {
    await Promise.allSettled([fetchProtocols({ bypassCache: true }), useProtocolsStore.getState().fetchCategories({ bypassCache: true })]);
  }, [fetchProtocols]);

  return (
    <View style={styles.screen}>
      <View style={styles.search}>
        <Input variant="outline" size="md">
          <InputField value={query} onChangeText={setQuery} placeholder={t('protocols.search')} accessibilityLabel={t('protocols.search')} testID="protocol-search" />
        </Input>
        {showKinds ? (
          <View style={styles.chips}>
            <OptionChips
              options={kindOptions}
              selected={activeKind === null ? [] : [activeKind]}
              onToggle={(value) => setKind((current) => (current === value ? null : value))}
              scroll
              accessibilityLabel={t('protocols.kinds.filter')}
              testID="protocol-kinds"
            />
          </View>
        ) : null}
        {categoryOptions.length > 0 ? (
          <View style={styles.chips}>
            <OptionChips
              options={categoryOptions}
              selected={activeCategoryId === null ? [] : [activeCategoryId]}
              onToggle={(value) => setCategoryId((current) => (current === value ? null : value))}
              scroll
              accessibilityLabel={t('protocols.categories.filter')}
              testID="protocol-categories"
            />
          </View>
        ) : null}
      </View>
      <FlatList
        data={visible}
        keyExtractor={(item: CallProtocolsResultData) => item.Id}
        renderItem={({ item }: { item: CallProtocolsResultData }) => <ProtocolCard protocol={item} entry={library[item.Id]} onPress={open} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refresh()} />}
        ListEmptyComponent={isLoading ? <Loading /> : <ZeroState icon={BookOpen} heading={t('protocols.empty')} description={t('protocols.emptyDescription')} onRetry={refresh} testID="protocol-list-empty" />}
        testID="protocol-list"
      />
    </View>
  );
};

/**
 * Department protocols (every app with `/protocols`): the library read from the persisted store, so it works offline, and,
 * where the app has `protocols.acknowledgments`, the member's "To acknowledge" list beside it. A protocol opens as its own page.
 */
export default function ProtocolListScreen() {
  const { acknowledgments: hasAcknowledgments } = useCapability('protocols');
  const owed = useProtocolAcknowledgmentsStore((state) => state.acknowledgments.filter(isAcknowledgmentOwed).length);
  const routeTab = useRouteTab(LIST_TABS);

  useEffect(() => {
    if (hasAcknowledgments) void useProtocolAcknowledgmentsStore.getState().fetchAcknowledgments();
  }, [hasAcknowledgments]);

  return (
    <View style={styles.screen} className="bg-background-50" testID="protocol-list-screen">
      {hasAcknowledgments ? (
        <SharedTabs
          variant="pills"
          className="flex-1"
          contentClassName="flex-1"
          activeIndex={routeTab.activeIndex}
          onChange={routeTab.selectIndex}
          tabs={[
            { key: 'library', title: 'protocols.tabs.library', content: <ProtocolLibrary /> },
            { key: 'acknowledgments', title: 'protocols.tabs.acknowledgments', content: <AcknowledgmentList />, badge: owed > 0 ? owed : undefined, badgeVariant: 'warning' },
          ]}
        />
      ) : (
        <ProtocolLibrary />
      )}
    </View>
  );
}

/** The list's tabs, kept in the route (`?tab=acknowledgments`) so Back from a protocol returns to the same one. */
const LIST_TABS = [{ key: 'library' }, { key: 'acknowledgments' }];

const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: { paddingHorizontal: 12, paddingTop: 12 },
  chips: { marginTop: 8 },
  list: { padding: 12 },
});
