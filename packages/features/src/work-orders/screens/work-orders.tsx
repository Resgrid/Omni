import { useTerm } from '@resgrid/auth';
import { useWorkOrdersStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { WorkOrderSummary } from '@resgrid/models';
import {
  Badge,
  BadgeText,
  Button,
  ButtonText,
  HStack,
  Input,
  InputField,
  InputIcon,
  InputSlot,
  KeyboardAwareScrollView,
  Loading,
  Pressable,
  RefreshControl,
  Text,
  useThemeColors,
  View,
  VStack,
  ZeroState,
} from '@resgrid/ui';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { Search, SlidersHorizontal, Wrench, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { WorkOrderFilterSheet } from '../components/work-order-filter-sheet';
import { WorkOrderRow } from '../components/work-order-row';
import { WorkOrdersGate } from '../components/work-orders-gate';
import { activeWorkOrderFilterCount, EMPTY_WORK_ORDER_FILTERS, filterWorkOrders, hasWorkOrderFilters, type WorkOrderListFilters } from '../lib/work-order-filters';
import { workOrderErrorCode, workOrderErrorKey } from '../lib/work-order-rules';
import { workOrderRoutes } from '../routes';

function WorkOrdersContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const title = useTerm('module.work-orders', t('workOrders.title'));
  const access = useWorkOrdersStore((state) => state.access);
  const list = useWorkOrdersStore((state) => state.list);
  const queuedReports = useWorkOrdersStore((state) => state.queuedReports);
  const isLoading = useWorkOrdersStore((state) => state.loading.list === true);
  const listError = useWorkOrdersStore((state) => state.errors.list ?? null);
  const colors = useThemeColors();
  const [filters, setFilters] = useState<WorkOrderListFilters>(EMPTY_WORK_ORDER_FILTERS);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const load = useCallback((assignedToMe?: boolean, bypassCache = false) => {
    const store = useWorkOrdersStore.getState();
    void store.fetchAccess({ bypassCache });
    if (!store.choices || bypassCache) void store.fetchChoices({ bypassCache });
    void store.fetchWorkOrders(assignedToMe === undefined ? undefined : { assignedToMe }, { bypassCache });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Reporting needs Readiness Pro maintenance; reading never does. Offline (list not loaded this session) the
  // persisted access decides, and the server re-checks the queued report.
  const canWrite = access?.MaintenanceEnabled === true && (list.loaded ? list.canWrite : true);
  const queued = useMemo(() => Object.values(queuedReports).sort((a, b) => b.createdAt - a.createdAt), [queuedReports]);
  const open = (order: WorkOrderSummary) => router.push(workOrderRoutes.detail(order.Id) as Href);
  const shown = useMemo(() => filterWorkOrders(list.items, filters), [list.items, filters]);
  const isFiltered = hasWorkOrderFilters(filters);
  const filterCount = activeWorkOrderFilterCount(filters);

  const filterButton = (assignedToMe: boolean, labelKey: string, testID: string) => (
    <Button variant={list.assignedToMe === assignedToMe ? 'solid' : 'outline'} size="sm" onPress={() => load(assignedToMe)} accessibilityState={{ selected: list.assignedToMe === assignedToMe }} testID={testID}>
      <ButtonText>{t(labelKey)}</ButtonText>
    </Button>
  );

  return (
    <View className="flex-1 bg-background-50" testID="work-orders-screen">
      <KeyboardAwareScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(undefined, true)} />}>
        <VStack space="md">
          <HStack className="items-center justify-between" space="sm">
            <Text className="flex-1 text-xl font-bold text-typography-900" accessibilityRole="header">
              {title}
            </Text>
            {canWrite ? (
              <Button size="sm" onPress={() => router.push(workOrderRoutes.report() as Href)} testID="work-orders-report">
                <ButtonText>{t('workOrders.report')}</ButtonText>
              </Button>
            ) : null}
          </HStack>
          {access && !access.MaintenanceEnabled ? (
            <Text className="text-typography-500" testID="work-orders-read-only">
              {t('workOrders.readOnly', { product: access.ProductName || 'Readiness Pro' })}
            </Text>
          ) : null}
          {listError ? (
            <Text accessibilityRole="alert" className="text-error-600" testID="work-orders-error">
              {t(workOrderErrorKey(workOrderErrorCode(listError)))}
            </Text>
          ) : null}
          <HStack space="sm">
            {filterButton(true, 'workOrders.assignedToMe', 'work-orders-assigned')}
            {filterButton(false, 'workOrders.allMine', 'work-orders-all')}
          </HStack>
          <HStack space="sm">
            <Input className="flex-1 bg-background-0" size="md" variant="outline">
              <InputSlot className="pl-3">
                <InputIcon as={Search} />
              </InputSlot>
              <InputField
                value={filters.query}
                onChangeText={(query: string) => setFilters((current) => ({ ...current, query }))}
                placeholder={t('workOrders.search')}
                accessibilityLabel={t('workOrders.search')}
                returnKeyType="search"
                autoCorrect={false}
                testID="work-orders-search"
              />
              {filters.query ? (
                <Pressable
                  onPress={() => setFilters((current) => ({ ...current, query: '' }))}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.clear_search')}
                  className="justify-center px-3"
                  testID="work-orders-search-clear"
                >
                  <InputIcon as={X} />
                </Pressable>
              ) : null}
            </Input>
            <Button
              variant={filterCount > 0 ? 'solid' : 'outline'}
              className={filterCount > 0 ? 'h-10' : 'h-10 bg-background-0'}
              onPress={() => setIsFilterOpen(true)}
              accessibilityLabel={t('workOrders.filterTitle')}
              testID="work-orders-filter-button"
            >
              <View>
                <SlidersHorizontal size={18} color={filterCount > 0 ? '#ffffff' : colors.icon} />
              </View>
              {filterCount > 0 ? <ButtonText testID="work-orders-filter-count">{String(filterCount)}</ButtonText> : null}
            </Button>
          </HStack>
          {isFiltered && list.items.length > 0 ? (
            <HStack className="items-center justify-between" space="sm">
              <Text size="sm" className="flex-1 text-typography-500" testID="work-orders-filter-summary">
                {t('workOrders.showing', { shown: shown.length, total: list.items.length })}
              </Text>
              <Button variant="link" size="sm" onPress={() => setFilters(EMPTY_WORK_ORDER_FILTERS)} testID="work-orders-filter-reset">
                <ButtonText>{t('workOrders.clearFilters')}</ButtonText>
              </Button>
            </HStack>
          ) : null}

          {queued.map((report) => (
            <HStack key={report.localId} className="items-center justify-between rounded-lg border border-dashed border-outline-300 bg-background-0 p-3" space="sm" testID={`work-order-queued-${report.localId}`}>
              <Text className="flex-1 font-semibold text-typography-900" numberOfLines={2}>
                {report.input.Content.Title}
              </Text>
              <Badge action={report.state === 'rejected' ? 'error' : 'warning'} size="sm">
                <BadgeText>{report.state === 'rejected' ? t('workOrders.reportNotSent') : t('workOrders.reportWaiting')}</BadgeText>
              </Badge>
            </HStack>
          ))}

          {isLoading && list.items.length === 0 ? (
            <Loading />
          ) : list.items.length === 0 ? (
            <ZeroState icon={Wrench} heading={list.assignedToMe ? t('workOrders.noneAssigned') : t('workOrders.none')} testID="work-orders-empty" />
          ) : shown.length === 0 ? (
            <ZeroState icon={Search} heading={t('workOrders.noMatches')} description={list.hasMore ? t('workOrders.searchMore') : undefined} testID="work-orders-no-matches" />
          ) : (
            <VStack>
              {shown.map((order) => (
                <WorkOrderRow key={order.Id} order={order} onPress={open} />
              ))}
            </VStack>
          )}

          {list.hasMore ? (
            <Pressable
              onPress={() => void useWorkOrdersStore.getState().fetchMoreWorkOrders()}
              disabled={isLoading}
              accessibilityRole="button"
              className="items-center rounded-md border border-outline-300 py-2"
              testID="work-orders-more"
            >
              <Text className="text-primary-700">{t('workOrders.more')}</Text>
            </Pressable>
          ) : null}
        </VStack>
      </KeyboardAwareScrollView>
      <WorkOrderFilterSheet isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} filters={filters} onChange={setFilters} />
    </View>
  );
}

/**
 * Work orders (Responder, `Maintenance.WorkOrders`): orders the person reported or that are assigned to them or their
 * roles, "Assigned to me" / "All I can see", search by title or number, status and priority filters over the loaded
 * pages, paging, reports still waiting to send, and Report a problem.
 */
export default function WorkOrdersScreen() {
  return (
    <WorkOrdersGate>
      <WorkOrdersContent />
    </WorkOrdersGate>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
});
