import { useTerm } from '@resgrid/auth';
import { isSafeRouteId } from '@resgrid/core/utils/route-ids';
import { useWorkOrdersStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { WorkOrderActivityType, type WorkOrderTransition } from '@resgrid/models';
import { Button, ButtonSpinner, ButtonText, HStack, Input, InputField, Loading, ScreenHeader, Text, Textarea, TextareaInput, useThemeColors, View, VStack, ZeroState } from '@resgrid/ui';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CheckSquare, Square } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { WorkOrderFiles } from '../components/work-order-files';
import { WorkOrderTransitionPanel } from '../components/work-order-transition-panel';
import { WorkOrdersGate } from '../components/work-orders-gate';
import { choiceName, formatDueDate, formatWorkOrderTime, isConflictCode, parseHours, photoFileName, todayKey, workOrderErrorCode, workOrderErrorKey } from '../lib/work-order-rules';

function WorkOrderDetailContent({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const colors = useThemeColors();
  const router = useRouter();
  const title = useTerm('module.work-orders', t('workOrders.title'));
  const detail = useWorkOrdersStore((state) => state.ordersById[id]);
  const choices = useWorkOrdersStore((state) => state.choices);
  const isLoading = useWorkOrdersStore((state) => state.loading.detail === true);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [hours, setHours] = useState('');
  const [hoursNote, setHoursNote] = useState('');

  useFocusEffect(
    useCallback(() => {
      const store = useWorkOrdersStore.getState();
      void store.fetchWorkOrder(id, { bypassCache: true });
      if (!store.choices) void store.fetchChoices();
    }, [id])
  );

  const activities = useMemo(() => [...(detail?.Activities ?? [])].sort((a, b) => String(b.CreatedOn).localeCompare(String(a.CreatedOn))), [detail?.Activities]);

  /** Runs a command at the order's current revision; a stale revision reloads the order and says so (Responder). */
  const command = async (key: string, run: (revision: number) => Promise<boolean>, success?: string): Promise<boolean> => {
    if (!detail) return false;
    setBusy(key);
    setNotice(null);
    const ok = await run(detail.Order.Revision);
    setBusy(null);
    if (!ok) {
      const code = workOrderErrorCode(useWorkOrdersStore.getState().actionError);
      setErrorCode(code);
      if (isConflictCode(code)) void useWorkOrdersStore.getState().fetchWorkOrder(id, { bypassCache: true });
      return false;
    }
    setErrorCode(null);
    if (success) setNotice(success);
    return true;
  };

  if (!detail) {
    return isLoading ? <Loading /> : <ZeroState isError heading={t('workOrders.errors.denied')} testID="work-order-missing" />;
  }

  const store = useWorkOrdersStore.getState();
  const order = detail.Order;
  const content = detail.Input?.Content;
  const canAct = detail.CanWrite;
  const canComment = canAct && (detail.CanContribute || detail.CanEdit || detail.CanManage || !!detail.ReportedBy);
  const unitName = choiceName(choices?.Units, order.UnitId);
  const groupName = choiceName(choices?.Groups, order.GroupId);
  const assetName = choiceName(choices?.Assets, order.AssetId);
  const due = formatDueDate(order.DueOn, locale);
  const loggedHours = detail.Labor.reduce((sum, entry) => sum + (entry.Content?.Hours ?? 0), 0);

  const transition = (input: Omit<WorkOrderTransition, 'Revision'>) => command('transition', (revision) => store.transition(id, { ...input, Revision: revision }));

  const saveComment = async () => {
    if (await command('comment', (revision) => store.comment(id, revision, comment.trim()))) setComment('');
  };

  const saveHours = async () => {
    const value = parseHours(hours);
    if (value === null) {
      setNotice(t('workOrders.hoursInvalid'));
      return;
    }
    const ok = await command('hours', (revision) =>
      store.logHours(id, { Revision: revision, UserId: null, WorkDate: todayKey(), Content: { Hours: value, Note: hoursNote.trim() || null, Currency: choices?.Currency ?? null } })
    );
    if (ok) {
      setHours('');
      setHoursNote('');
    }
  };

  const attach = async (source: 'camera' | 'library') => {
    setNotice(null);
    try {
      const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorCode('photo_denied');
        return;
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      await command('photo', (revision) => store.attachFile(id, revision, { uri: asset.uri, name: photoFileName(order.Number), type: asset.mimeType ?? 'image/jpeg' }), t('workOrders.photoAdded'));
    } catch {
      setErrorCode('retry');
    }
  };

  return (
    <View className="flex-1 bg-background-0" testID="work-order-detail-screen">
      <ScreenHeader title={order.Number || title} onBack={() => router.back()} testID="work-order-detail-header" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <VStack space="md">
          <Text className="text-xl font-bold text-typography-900" accessibilityRole="header">
            {order.Title}
          </Text>
          {errorCode ? (
            <Text accessibilityRole="alert" className="text-error-600" testID="work-order-error">
              {t(workOrderErrorKey(errorCode))}
            </Text>
          ) : null}
          {notice ? (
            <Text className="text-typography-500" testID="work-order-notice">
              {notice}
            </Text>
          ) : null}

          <VStack space="xs">
            <Text className="text-typography-500" testID="work-order-summary">
              {[order.Number, t(`workOrders.status.${order.Status}`), t(`workOrders.priority.${order.Priority}`)].join(' · ')}
            </Text>
            {detail.Input ? <Text className="text-typography-500">{t(`workOrders.type.${detail.Input.Type}`)}</Text> : null}
            {unitName ? <Text className="text-typography-800">{t('workOrders.unitIs', { name: unitName })}</Text> : null}
            {groupName ? <Text className="text-typography-800">{t('workOrders.groupIs', { name: groupName })}</Text> : null}
            {assetName ? <Text className="text-typography-800">{t('workOrders.assetIs', { name: assetName })}</Text> : null}
            {content?.LocationText ? <Text className="text-typography-800">{t('workOrders.locationIs', { location: content.LocationText })}</Text> : null}
            {due ? <Text className="text-typography-500">{t('workOrders.due', { date: due })}</Text> : null}
            {content?.SafetyCritical || content?.HazardousWork ? (
              <Text className="text-error-600" testID="work-order-safety-flag">
                {t('workOrders.safety')}
              </Text>
            ) : null}
          </VStack>

          {content?.Description ? <Text className="text-typography-800">{content.Description}</Text> : null}

          {(content?.Steps ?? []).length > 0 ? (
            <VStack space="xs" testID="work-order-steps">
              <Text className="font-semibold text-typography-900">{t('workOrders.steps')}</Text>
              {(content?.Steps ?? []).map((step, index) => (
                <HStack key={`${index}-${step.Text}`} space="sm" className="items-center" accessibilityState={{ checked: step.Completed }}>
                  <View>{step.Completed ? <CheckSquare size={16} color={colors.success} /> : <Square size={16} color={colors.icon} />}</View>
                  <Text className="flex-1 text-typography-800">{step.Text}</Text>
                </HStack>
              ))}
            </VStack>
          ) : null}
          {content?.Resolution ? <Text className="text-typography-800">{t('workOrders.resolutionIs', { text: content.Resolution })}</Text> : null}

          {canAct && detail.CanAccept ? (
            <Button action="positive" onPress={() => void command('accept', (revision) => store.accept(id, revision))} isDisabled={busy !== null} testID="work-order-accept">
              {busy === 'accept' ? <ButtonSpinner /> : null}
              <ButtonText>{t('workOrders.accept')}</ButtonText>
            </Button>
          ) : null}

          {canAct && detail.Transitions.length > 0 ? <WorkOrderTransitionPanel detail={detail} isBusy={busy !== null} onSubmit={transition} /> : null}

          {canAct && detail.CanContribute ? (
            <VStack space="sm" className="rounded-lg border border-outline-200 p-3" testID="work-order-labor">
              <Text className="font-semibold text-typography-900">{t('workOrders.logHours')}</Text>
              <HStack space="sm">
                <Input style={styles.hours}>
                  <InputField value={hours} onChangeText={setHours} keyboardType="decimal-pad" placeholder={t('workOrders.hours')} accessibilityLabel={t('workOrders.hours')} testID="work-order-hours" />
                </Input>
                <Input className="flex-1">
                  <InputField value={hoursNote} onChangeText={setHoursNote} placeholder={t('workOrders.hoursNote')} accessibilityLabel={t('workOrders.hoursNote')} maxLength={4000} testID="work-order-hours-note" />
                </Input>
              </HStack>
              <Button variant="outline" onPress={() => void saveHours()} isDisabled={busy !== null || !hours.trim()} testID="work-order-hours-save">
                <ButtonText>{t('workOrders.saveHours')}</ButtonText>
              </Button>
              {loggedHours > 0 ? <Text className="text-typography-500">{t('workOrders.hoursLogged', { hours: loggedHours })}</Text> : null}
            </VStack>
          ) : null}

          {canComment ? (
            <VStack space="sm">
              <Textarea>
                <TextareaInput value={comment} onChangeText={setComment} placeholder={t('workOrders.commentHint')} accessibilityLabel={t('workOrders.commentHint')} maxLength={10000} testID="work-order-comment" />
              </Textarea>
              <Button variant="outline" onPress={() => void saveComment()} isDisabled={busy !== null || !comment.trim()} testID="work-order-comment-save">
                <ButtonText>{t('workOrders.addComment')}</ButtonText>
              </Button>
              <HStack space="sm">
                <Button variant="outline" size="sm" onPress={() => void attach('camera')} isDisabled={busy !== null} testID="work-order-camera">
                  <ButtonText>{t('workOrders.takePhoto')}</ButtonText>
                </Button>
                <Button variant="outline" size="sm" onPress={() => void attach('library')} isDisabled={busy !== null} testID="work-order-library">
                  <ButtonText>{t('workOrders.choosePhoto')}</ButtonText>
                </Button>
              </HStack>
            </VStack>
          ) : null}

          <WorkOrderFiles files={detail.Files} />

          {activities.length > 0 ? (
            <VStack space="xs" testID="work-order-activity">
              <Text className="font-semibold text-typography-900">{t('workOrders.activity')}</Text>
              {activities.map((activity) => (
                <VStack key={activity.Id} className="border-b border-outline-100 pb-1" testID={`work-order-activity-${activity.Id}`}>
                  <Text size="sm" className="text-typography-500">
                    {`${formatWorkOrderTime(activity.CreatedOn, locale)} · ${t(`workOrders.activityType.${activity.Type}`)}${activity.Type === WorkOrderActivityType.StatusChanged && activity.NewStatus != null ? ` → ${t(`workOrders.status.${activity.NewStatus}`)}` : ''}`}
                  </Text>
                  {activity.Note ? <Text className="text-typography-800">{activity.Note}</Text> : null}
                </VStack>
              ))}
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>
    </View>
  );
}

export interface WorkOrderDetailScreenProps {
  /** Defaults to the `id` route param. */
  workOrderId?: string;
}

/**
 * One work order (Responder): what it is about, where it stands and what this person may do next — accept, change
 * status (with the fields each transition requires), log hours, comment, attach photos, view files and activity. The
 * server's `Transitions` and `Can*` flags drive every control; a stale revision reloads the order. Online only.
 */
export default function WorkOrderDetailScreen({ workOrderId }: WorkOrderDetailScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const id = workOrderId ?? (routeId && isSafeRouteId(routeId) ? routeId : '');
  return (
    <WorkOrdersGate>
      {id ? (
        <WorkOrderDetailContent id={id} />
      ) : (
        <View className="flex-1 bg-background-0">
          <ScreenHeader title={t('workOrders.title')} onBack={() => router.back()} />
          <ZeroState isError heading={t('workOrders.errors.denied')} testID="work-order-invalid" />
        </View>
      )}
    </WorkOrdersGate>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  hours: { width: 96 },
});
