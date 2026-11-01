import { useWorkOrdersStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { WorkOrderPriority, WorkOrderType } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, Input, InputField, ScreenHeader, Switch, Text, Textarea, TextareaInput, useToast, View, VStack } from '@resgrid/ui';
import { type Href, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { WorkOrderChoiceChips, type WorkOrderChoiceOption } from '../components/choice-chips';
import { WorkOrdersGate } from '../components/work-orders-gate';
import { workOrderRoutes } from '../routes';

const NONE = '';

function WorkOrderReportContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const access = useWorkOrdersStore((state) => state.access);
  const choices = useWorkOrdersStore((state) => state.choices);
  const list = useWorkOrdersStore((state) => state.list);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState(String(WorkOrderType.Corrective));
  const [priority, setPriority] = useState(String(WorkOrderPriority.Normal));
  const [unitId, setUnitId] = useState(NONE);
  const [groupId, setGroupId] = useState(NONE);
  const [assetId, setAssetId] = useState(NONE);
  const [safetyCritical, setSafetyCritical] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const store = useWorkOrdersStore.getState();
    if (!store.choices) void store.fetchChoices();
    if (!store.access) void store.fetchAccess();
  }, []);

  const canWrite = access?.MaintenanceEnabled === true && (list.loaded ? list.canWrite : true);
  const option = (value: string | number, label: string): WorkOrderChoiceOption => ({ value: String(value), label });
  const none = option(NONE, t('workOrders.form.none'));
  const typeOptions = Object.values(WorkOrderType).map((value) => option(value, t(`workOrders.type.${value}`)));
  const priorityOptions = Object.values(WorkOrderPriority).map((value) => option(value, t(`workOrders.priority.${value}`)));
  const units = choices?.Units ?? [];
  const groups = choices?.Groups ?? [];
  const assets = choices?.Assets ?? [];

  const submit = async () => {
    if (!title.trim() || !canWrite) return;
    setIsSending(true);
    // A new order starts Requested and goes to the target's managers; the outbox id is its RequestId (idempotent create).
    const result = await useWorkOrdersStore.getState().report({
      Revision: 0,
      Type: Number(type),
      Priority: Number(priority),
      TargetUnitId: unitId ? Number(unitId) : null,
      TargetGroupId: groupId ? Number(groupId) : null,
      InventoryAssetId: assetId || null,
      Content: {
        Title: title.trim(),
        Description: description.trim() || null,
        LocationText: location.trim() || null,
        Currency: choices?.Currency ?? null,
        SafetyCritical: safetyCritical,
        Steps: [],
      },
    });
    setIsSending(false);
    if (result.outcome === 'rejected') {
      toast.error(t('workOrders.errors.retry'));
      return;
    }
    if (result.outcome === 'queued') {
      toast.info(t('workOrders.reportQueued'));
      router.back();
      return;
    }
    toast.success(t('workOrders.reportSent'));
    const created = Object.values(useWorkOrdersStore.getState().ordersById).find((detail) => detail.Input?.RequestId === result.id);
    void useWorkOrdersStore.getState().fetchWorkOrders();
    if (created) router.replace(workOrderRoutes.detail(created.Order.Id) as Href);
    else router.back();
  };

  return (
    <View className="flex-1 bg-background-0" testID="work-order-report-screen">
      <ScreenHeader title={t('workOrders.report')} onBack={() => router.back()} testID="work-order-report-header" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <VStack space="md">
          {!canWrite && access ? (
            <Text className="text-typography-500" testID="work-order-cannot-report">
              {t('workOrders.cannotReport')}
            </Text>
          ) : null}
          <VStack space="xs">
            <Text className="font-semibold text-typography-900">{t('workOrders.form.title')}</Text>
            <Input>
              <InputField value={title} onChangeText={setTitle} maxLength={200} placeholder={t('workOrders.form.titleHint')} accessibilityLabel={t('workOrders.form.title')} testID="work-order-title" />
            </Input>
          </VStack>
          <VStack space="xs">
            <Text className="font-semibold text-typography-900">{t('workOrders.form.description')}</Text>
            <Textarea>
              <TextareaInput
                value={description}
                onChangeText={setDescription}
                maxLength={20000}
                placeholder={t('workOrders.form.descriptionHint')}
                accessibilityLabel={t('workOrders.form.description')}
                testID="work-order-description"
              />
            </Textarea>
          </VStack>
          <VStack space="xs">
            <Text className="font-semibold text-typography-900">{t('workOrders.form.type')}</Text>
            <WorkOrderChoiceChips options={typeOptions} value={type} onChange={setType} accessibilityLabel={t('workOrders.form.type')} testID="work-order-type" />
          </VStack>
          <VStack space="xs">
            <Text className="font-semibold text-typography-900">{t('workOrders.form.priority')}</Text>
            <WorkOrderChoiceChips options={priorityOptions} value={priority} onChange={setPriority} accessibilityLabel={t('workOrders.form.priority')} testID="work-order-priority" />
          </VStack>
          {units.length > 0 ? (
            <VStack space="xs">
              <Text className="font-semibold text-typography-900">{t('workOrders.form.unit')}</Text>
              <WorkOrderChoiceChips options={[none, ...units.map((unit) => option(unit.Id, unit.Name))]} value={unitId} onChange={setUnitId} accessibilityLabel={t('workOrders.form.unit')} testID="work-order-unit" />
            </VStack>
          ) : null}
          {groups.length > 0 ? (
            <VStack space="xs">
              <Text className="font-semibold text-typography-900">{t('workOrders.form.group')}</Text>
              <WorkOrderChoiceChips
                options={[none, ...groups.map((group) => option(group.Id, group.Name))]}
                value={groupId}
                onChange={setGroupId}
                accessibilityLabel={t('workOrders.form.group')}
                testID="work-order-group"
              />
            </VStack>
          ) : null}
          {assets.length > 0 ? (
            <VStack space="xs">
              <Text className="font-semibold text-typography-900">{t('workOrders.form.asset')}</Text>
              <WorkOrderChoiceChips
                options={[none, ...assets.map((asset) => option(asset.Id, asset.Name))]}
                value={assetId}
                onChange={setAssetId}
                accessibilityLabel={t('workOrders.form.asset')}
                testID="work-order-asset"
              />
            </VStack>
          ) : null}
          <VStack space="xs">
            <Text className="font-semibold text-typography-900">{t('workOrders.form.location')}</Text>
            <Input>
              <InputField value={location} onChangeText={setLocation} maxLength={1000} placeholder={t('workOrders.form.locationHint')} accessibilityLabel={t('workOrders.form.location')} testID="work-order-location" />
            </Input>
          </VStack>
          <HStack className="items-center justify-between">
            <Text className="flex-1 text-typography-900">{t('workOrders.form.safetyCritical')}</Text>
            <Switch value={safetyCritical} onValueChange={setSafetyCritical} accessibilityLabel={t('workOrders.form.safetyCritical')} testID="work-order-safety" />
          </HStack>
          <Button onPress={() => void submit()} isDisabled={isSending || !canWrite || !title.trim()} testID="work-order-submit">
            {isSending ? <ButtonSpinner /> : null}
            <ButtonText>{t('workOrders.form.submit')}</ButtonText>
          </Button>
          <Text className="text-typography-500">{t('workOrders.form.photosAfter')}</Text>
        </VStack>
      </ScrollView>
    </View>
  );
}

/** Report a problem (Responder): what it is about (apparatus, station, equipment or just a location), offline-capable. */
export default function WorkOrderReportScreen() {
  return (
    <WorkOrdersGate>
      <WorkOrderReportContent />
    </WorkOrdersGate>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
});
