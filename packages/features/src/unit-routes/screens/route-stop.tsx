import { useRoutesStore } from '@resgrid/data';
import { useTranslation } from '@resgrid/i18n';
import { Button, ButtonSpinner, ButtonText, HStack, Pressable, ScreenHeader, ScrollView, Text, Textarea, TextareaInput, useFormFactor, useToast, View, VStack, ZeroState } from '@resgrid/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Clock, MapPin, User } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { SkipStopDialog } from '../components/skip-stop-dialog';
import { StopCard } from '../components/stop-card';
import { useStopActions } from '../hooks/use-stop-actions';
import { formatRouteTime } from '../lib/route-format';
import { instanceMapStops, mapBounds, routeColor, stopGeofence } from '../lib/route-map';
import { STOP_PRIORITY_LOOK, STOP_TYPE_KEYS, type StopActionKind, stopStatusLook } from '../lib/route-status';
import { type RenderRouteMap, RouteMapSlot } from '../map-slot';
import { readRouteParam, unitRoutesRoutes } from '../routes';

export interface RouteStopScreenProps {
  /** The instance stop id (or plan stop id) of a stop on the active route. */
  stopId?: string;
  renderMap?: RenderRouteMap;
}

const Chip: React.FC<{ label: string; color: string; testID?: string }> = ({ label, color, testID }) => (
  <View style={StyleSheet.flatten([styles.chip, { backgroundColor: `${color}26`, borderColor: color }])} testID={testID}>
    <Text className="text-xs font-semibold" style={{ color }}>
      {label}
    </Text>
  </View>
);

/**
 * One stop of the active route (`/routes/stop/[id]`): priority, type and status (Core's enums — Unit mislabelled them),
 * planned times, a geofence map, the stop contact, crew notes (saved online) and check in / check out / skip (queued
 * offline). Works from the persisted stop list, so it opens without a connection.
 */
export default function RouteStopScreen({ stopId: stopIdProp, renderMap }: RouteStopScreenProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { isElectron, isDesktop } = useFormFactor();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const stopId = stopIdProp ?? readRouteParam(params.id);
  const stop = useRoutesStore((state) => (stopId ? (state.stopDetails.find((row) => row.RouteInstanceStopId === stopId) ?? state.stopDetails.find((row) => row.RouteStopId === stopId)) : undefined)) ?? null;
  const plan = useRoutesStore((state) => (stop && state.activePlan?.RoutePlanId === stop.RoutePlanId ? state.activePlan : null));
  const planColor = useRoutesStore((state) => state.routePlans.find((row) => row.RoutePlanId === stop?.RoutePlanId)?.RouteColor ?? null);
  const { checkIn, checkOut, skip, busyStopId } = useStopActions();
  const [notes, setNotes] = useState(stop?.InstanceNotes ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSkipOpen, setIsSkipOpen] = useState(false);

  useEffect(() => setNotes(stop?.InstanceNotes ?? ''), [stop?.InstanceNotes]);

  const id = stop?.RouteInstanceStopId ?? null;
  const mapStops = useMemo(() => (stop ? instanceMapStops([stop], id) : []), [id, stop]);
  const geofence = useMemo(() => stopGeofence(stop, plan?.GeofenceRadiusMeters), [plan?.GeofenceRadiusMeters, stop]);
  const back = () => (router.canGoBack() ? router.back() : router.replace(unitRoutesRoutes.active()));

  if (!stop) {
    return (
      <View className="flex-1 bg-background-50" testID="route-stop-screen">
        <ScreenHeader title={t('routes.stop_detail')} onBack={back} />
        <ZeroState icon={MapPin} heading={t('routes.no_stops')} description={t('unit_routes.stop_not_on_route')} testID="route-stop-missing" />
      </View>
    );
  }

  const status = stopStatusLook(stop.Status);
  const priority = STOP_PRIORITY_LOOK[stop.Priority] ?? STOP_PRIORITY_LOOK[0];
  const arrival = formatRouteTime(stop.PlannedArrivalTime);
  const departure = formatRouteTime(stop.PlannedDepartureTime);
  const checkedIn = formatRouteTime(stop.CheckInOn);
  const checkedOut = formatRouteTime(stop.CheckOutOn);
  const hasContact = !!stop.ContactId || !!stop.ContactName;

  const onAction = (kind: StopActionKind) => {
    if (!id) return;
    if (kind === 'checkIn') void checkIn(id);
    else if (kind === 'checkOut') void checkOut(id);
    else setIsSkipOpen(true);
  };

  const saveNotes = async () => {
    if (!id) return;
    setIsSaving(true);
    const ok = await useRoutesStore.getState().updateNotes(id, notes.trim());
    setIsSaving(false);
    if (ok) toast.success(t('unit_routes.notes_saved'));
    else toast.error(t(useRoutesStore.getState().actionError?.messageKey ?? 'common.errorOccurred'));
  };

  return (
    <View className="flex-1 bg-background-50" testID="route-stop-screen">
      <ScreenHeader title={stop.Name || t('routes.stop_detail')} onBack={back} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <VStack space="sm" className="bg-background-0 p-4">
          <Text className="text-lg font-bold text-typography-900">{stop.Name}</Text>
          {stop.Address ? <Text className="text-sm text-typography-500">{stop.Address}</Text> : null}
          <HStack space="sm" className="flex-wrap">
            <Chip label={t(priority.labelKey)} color={priority.color} testID="route-stop-priority" />
            <Chip label={t(STOP_TYPE_KEYS[stop.StopType] ?? 'common.unknown')} color="#0ea5e9" testID="route-stop-type" />
            <Chip label={t(status.labelKey)} color={status.color} testID="route-stop-status" />
          </HStack>
          {stop.Description ? <Text className="text-sm text-typography-700">{stop.Description}</Text> : null}
        </VStack>

        {arrival || departure || (stop.EstimatedDwellMinutes ?? 0) > 0 || checkedIn || checkedOut ? (
          <VStack space="xs" className="mt-2 bg-background-0 p-4" testID="route-stop-schedule">
            <HStack space="xs" className="items-center">
              <View>
                <Clock size={14} color="#6b7280" />
              </View>
              <Text className="text-sm font-medium text-typography-900">{t('routes.schedule')}</Text>
            </HStack>
            {arrival ? <Text className="text-sm text-typography-700">{`${t('routes.planned_arrival')}: ${arrival}`}</Text> : null}
            {departure ? <Text className="text-sm text-typography-700">{`${t('routes.planned_departure')}: ${departure}`}</Text> : null}
            {(stop.EstimatedDwellMinutes ?? 0) > 0 ? (
              <Text className="text-xs text-typography-500">{`${t('routes.dwell_time')}: ${t('unit_routes.duration_minutes', { minutes: stop.EstimatedDwellMinutes })}`}</Text>
            ) : null}
            {checkedIn ? <Text className="text-xs text-typography-500">{t('unit_routes.checked_in_at', { time: checkedIn })}</Text> : null}
            {checkedOut ? <Text className="text-xs text-typography-500">{t('unit_routes.checked_out_at', { time: checkedOut })}</Text> : null}
            {stop.SkipReason ? <Text className="text-xs text-warning-700">{`${t('routes.skip_reason')}: ${stop.SkipReason}`}</Text> : null}
          </VStack>
        ) : null}

        <View className="mt-2">
          <RouteMapSlot
            kind="stop"
            renderMap={renderMap}
            height={200}
            stops={mapStops}
            line={null}
            geofence={geofence}
            color={routeColor(planColor ?? plan?.RouteColor)}
            bounds={mapBounds(mapStops, null)}
            showUserLocation
          />
        </View>

        {hasContact ? (
          <Pressable onPress={() => router.push(unitRoutesRoutes.stopContact(stop.RouteStopId))} accessibilityRole="button" testID="route-stop-contact" className="mt-2 bg-background-0 p-4">
            <HStack space="md" className="items-center">
              <View style={styles.contactIcon}>
                <User size={20} color="#3b82f6" />
              </View>
              <VStack className="flex-1">
                <Text className="text-sm font-semibold text-typography-900">{stop.ContactName || t('routes.contact')}</Text>
                <Text className="text-xs text-typography-500">{stop.ContactNumber || t('routes.contact_details')}</Text>
              </VStack>
              <ChevronRight size={18} color="#9ca3af" />
            </HStack>
          </Pressable>
        ) : null}

        {stop.PlanNotes ? (
          <VStack className="mt-2 bg-background-0 p-4">
            <Text className="mb-1 text-sm font-medium text-typography-900">{t('routes.description')}</Text>
            <Text className="text-sm text-typography-700">{stop.PlanNotes}</Text>
          </VStack>
        ) : null}

        {id ? (
          <VStack space="sm" className="mt-2 bg-background-0 p-4">
            <Text className="text-sm font-medium text-typography-900">{t('routes.notes')}</Text>
            <Textarea>
              <TextareaInput value={notes} onChangeText={setNotes} placeholder={t('routes.notes_placeholder')} accessibilityLabel={t('routes.notes')} testID="route-stop-notes" />
            </Textarea>
            <Button variant="outline" onPress={() => void saveNotes()} isDisabled={isSaving || notes.trim() === (stop.InstanceNotes ?? '').trim()} testID="route-stop-save-notes">
              {isSaving ? <ButtonSpinner /> : <ButtonText>{t('common.save')}</ButtonText>}
            </Button>
          </VStack>
        ) : null}

        <View className="mt-2 px-4">
          <StopCard stop={stop} isCurrent onAction={(kind) => onAction(kind)} isBusy={busyStopId === id} actionMinHeight={isElectron || isDesktop ? 64 : 48} testID="route-stop-actions" />
        </View>
      </ScrollView>
      <SkipStopDialog
        isOpen={isSkipOpen}
        stopName={stop.Name}
        onCancel={() => setIsSkipOpen(false)}
        onConfirm={(reason) => {
          setIsSkipOpen(false);
          if (id) void skip(id, reason);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  contactIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#dbeafe' },
});
