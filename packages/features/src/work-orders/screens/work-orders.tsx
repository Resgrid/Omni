import { useTerm } from '@resgrid/auth';
import { useWorkOrdersStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import type { WorkOrderSummary } from '@resgrid/models';
import { Badge, BadgeText, Button, ButtonText, HStack, Loading, Pressable, RefreshControl, ScrollView, Text, View, VStack, ZeroState } from '@resgrid/ui';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { Wrench } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { WorkOrderRow } from '../components/work-order-row';
import { WorkOrdersGate } from '../components/work-orders-gate';
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

  const filterButton = (assignedToMe: boolean, labelKey: string, testID: string) => (
    <Button variant={list.assignedToMe === assignedToMe ? 'solid' : 'outline'} size="sm" onPress={() => load(assignedToMe)} accessibilityState={{ selected: list.assignedToMe === assignedToMe }} testID={testID}>
      <ButtonText>{t(labelKey)}</ButtonText>
    </Button>
  );

  return (
    <View className="flex-1 bg-background-50" testID="work-orders-screen">
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(undefined, true)} />}>
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
          ) : (
            <VStack>
              {list.items.map((order) => (
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
      </ScrollView>
    </View>
  );
}

/**
 * Work orders (Responder, `Maintenance.WorkOrders`): orders the person reported or that are assigned to them or their
 * roles, "Assigned to me" / "All I can see", paging, reports still waiting to send, and Report a problem.
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
