import type { VariantManifest } from '@resgrid/config';
import { type HydrationStep, type OutboxHandler, registerOutboxHandler } from '@resgrid/offline';

import { useCalendarStore } from '../calendar/calendar-store';
import { callCreateHandler } from '../calls/call-create-handler';
import { callFileUploadHandler, callNoteAddHandler } from '../calls/call-write-handlers';
import { useCallsStore } from '../calls/calls-store';
import { checkInPerformHandler } from '../calls/check-in-timers-store';
import { chatMessageSendHandler, useChatStore } from '../chat/chat-store';
import { useContactsStore } from '../contacts/contacts-store';
import { dataNow, getDataSessionScope } from '../core/runtime';
import { type SliceMeta } from '../core/slices';
import { incidentCommandHandlers } from '../incident-command/command-handlers';
import { useCommandStore } from '../incident-command/command-store';
import { inventoryCountSaveHandler, useInventoryStore } from '../inventory/inventory-store';
import { useCustomMapsStore } from '../mapping/custom-maps-store';
import { messageSendHandler, useMessagesStore } from '../messages/messages-store';
import { useNotesStore } from '../notes/notes-store';
import { expenseSaveHandler, timeEntriesSaveHandler } from '../operations/operations-store';
import { personnelStaffingSetHandler, personnelStatusSetHandler, usePersonnelStatusStore } from '../personnel/personnel-status-store';
import { usePersonnelStore } from '../personnel/personnel-store';
import { usePoisStore } from '../pois/pois-store';
import { useProtocolsStore } from '../protocols/protocols-store';
import { recordCommandHandler, recordDraftSaveHandler } from '../records/records-store';
import { routeStopCheckInHandler, routeStopCheckOutHandler, routeStopSkipHandler, useRoutesStore } from '../routes/routes-store';
import { useShiftsStore } from '../shifts/shifts-store';
import { useUnitRolesStore } from '../units/unit-roles-store';
import { unitStatusSetHandler } from '../units/unit-status-store';
import { useUnitsStore } from '../units/units-store';
import { useWeatherAlertsStore } from '../weather-alerts/weather-alerts-store';
import { workOrderReportHandler } from '../work-orders/work-orders-store';
import { type DataHydrationStepId, type DataOutboxType, resolveDataOfflineScope } from './scope';

/** Handlers per scope entry. Typed handlers register into the untyped registry (offline's method-syntax contract). */
const HANDLERS: Record<DataOutboxType, OutboxHandler[]> = {
  'calls.create': [callCreateHandler as unknown as OutboxHandler],
  'calls.note.add': [callNoteAddHandler as unknown as OutboxHandler],
  'calls.file.upload': [callFileUploadHandler as unknown as OutboxHandler],
  'checkIn.perform': [checkInPerformHandler as unknown as OutboxHandler],
  'units.status.set': [unitStatusSetHandler as unknown as OutboxHandler],
  'personnel.status.set': [personnelStatusSetHandler as unknown as OutboxHandler],
  'personnel.staffing.set': [personnelStaffingSetHandler as unknown as OutboxHandler],
  'chat.message.send': [chatMessageSendHandler as unknown as OutboxHandler],
  'messages.send': [messageSendHandler as unknown as OutboxHandler],
  'routes.stop': [routeStopCheckInHandler, routeStopCheckOutHandler, routeStopSkipHandler] as unknown as OutboxHandler[],
  'inventory.count.save': [inventoryCountSaveHandler as unknown as OutboxHandler],
  'operations.timeEntries.save': [timeEntriesSaveHandler as unknown as OutboxHandler],
  'operations.expense.save': [expenseSaveHandler as unknown as OutboxHandler],
  'records.draft.save': [recordDraftSaveHandler as unknown as OutboxHandler],
  'records.command': [recordCommandHandler as unknown as OutboxHandler],
  'workOrders.report': [workOrderReportHandler as unknown as OutboxHandler],
  ic: incidentCommandHandlers as unknown as OutboxHandler[],
};

/** Every handler the data layer defines (tests, diagnostics). */
export const ALL_DATA_OUTBOX_HANDLERS: OutboxHandler[] = Object.values(HANDLERS).flat();

export interface HandlerRegistryLike {
  register(handler: OutboxHandler): () => void;
}

const defaultRegistry: HandlerRegistryLike = { register: (handler) => registerOutboxHandler(handler) };

/** Registers the outbox handlers in the variant's offline scope (plan §8.3: variants register only their scope). */
export function registerDataOutboxHandlers(manifest: VariantManifest, registry: HandlerRegistryLike = defaultRegistry): () => void {
  const scope = resolveDataOfflineScope(manifest);
  const disposers = scope.handlers.flatMap((type) => HANDLERS[type].map((handler) => registry.register(handler)));
  return () => disposers.forEach((dispose) => dispose());
}

/** A hydrated slice older than this is no longer "field ready". */
export const HYDRATION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const fresh = <K extends string>(meta: SliceMeta<K>, keys: K[]): boolean => keys.every((key) => (meta.fetchedAt[key] ?? 0) > 0 && dataNow() - (meta.fetchedAt[key] ?? 0) <= HYDRATION_MAX_AGE_MS);

const unitId = (): number | null => getDataSessionScope()?.unitId ?? null;

interface StepDefinition {
  run: () => Promise<void>;
  isCurrent: () => boolean;
  dependsOn?: DataHydrationStepId[];
}

const bypass = { bypassCache: true };

/** Working-set fetches per hydration step (also the reconnect "pull deltas" pass until Core has scoped bundles). */
const STEPS: Record<DataHydrationStepId, StepDefinition> = {
  'data.calls': {
    run: async () => {
      const store = useCallsStore.getState();
      await store.init(bypass);
      const openIds = useCallsStore.getState().calls.map((call) => call.CallId);
      await Promise.all([store.fetchCallDispatches(openIds, bypass), store.prefetchCallExtras(openIds)]);
    },
    isCurrent: () => fresh(useCallsStore.getState(), ['calls', 'priorities', 'types']),
  },
  'data.call-queues': {
    run: async () => {
      await Promise.all([useCallsStore.getState().fetchPendingCalls(bypass), useCallsStore.getState().fetchScheduledCalls(bypass)]);
    },
    isCurrent: () => fresh(useCallsStore.getState(), ['pending', 'scheduled']),
  },
  'data.units': { run: () => useUnitsStore.getState().fetchUnits(bypass), isCurrent: () => fresh(useUnitsStore.getState(), ['units', 'currentStatuses']) },
  'data.unit-roles': {
    run: async () => {
      const id = unitId();
      await (id !== null ? useUnitRolesStore.getState().fetchAllForUnit(String(id), bypass) : useUnitRolesStore.getState().fetchRoles(bypass));
    },
    isCurrent: () => fresh(useUnitRolesStore.getState(), ['roles']),
  },
  'data.personnel': { run: () => usePersonnelStore.getState().init(bypass), isCurrent: () => fresh(usePersonnelStore.getState(), ['personnel', 'statusOptions', 'staffingOptions']) },
  'data.own-status': {
    run: async () => {
      await Promise.all([usePersonnelStatusStore.getState().fetchCurrentStatus(bypass), usePersonnelStatusStore.getState().fetchCurrentStaffing(bypass)]);
    },
    isCurrent: () => fresh(usePersonnelStatusStore.getState(), ['currentStatus', 'currentStaffing']),
  },
  'data.contacts': {
    run: async () => {
      await Promise.all([useContactsStore.getState().fetchContacts(bypass), useContactsStore.getState().fetchCategories(bypass)]);
    },
    isCurrent: () => fresh(useContactsStore.getState(), ['contacts']),
  },
  'data.pois': {
    run: async () => {
      await Promise.all([usePoisStore.getState().fetchPoiTypes(bypass), usePoisStore.getState().fetchPois(bypass), usePoisStore.getState().fetchDestinationPois(bypass)]);
    },
    isCurrent: () => fresh(usePoisStore.getState(), ['poiTypes', 'pois']),
  },
  'data.protocols': { run: () => useProtocolsStore.getState().fetchProtocols(bypass), isCurrent: () => fresh(useProtocolsStore.getState(), ['protocols']) },
  'data.notes': { run: () => useNotesStore.getState().fetchNotes(bypass), isCurrent: () => fresh(useNotesStore.getState(), ['notes']) },
  'data.weather-alerts': { run: () => useWeatherAlertsStore.getState().fetchActiveAlerts(bypass), isCurrent: () => fresh(useWeatherAlertsStore.getState(), ['alerts']) },
  'data.shifts': {
    run: async () => {
      await Promise.all([useShiftsStore.getState().fetchTodaysShifts(bypass), useShiftsStore.getState().fetchMyShifts(undefined, bypass)]);
    },
    isCurrent: () => fresh(useShiftsStore.getState(), ['today', 'mine']),
  },
  'data.calendar': { run: () => useCalendarStore.getState().fetchCalendarItems(bypass), isCurrent: () => fresh(useCalendarStore.getState(), ['items']) },
  'data.messages': {
    run: async () => {
      await Promise.all([useMessagesStore.getState().fetchInboxMessages(bypass), useMessagesStore.getState().fetchSentMessages(bypass)]);
    },
    isCurrent: () => fresh(useMessagesStore.getState(), ['inbox']),
  },
  'data.routes': {
    run: async () => {
      const id = unitId();
      if (id === null) return;
      const store = useRoutesStore.getState();
      await Promise.all([store.fetchRoutePlans(id, bypass), store.fetchActiveRoute(id, bypass)]);
      const instanceId = useRoutesStore.getState().activeInstance?.RouteInstanceId;
      if (instanceId) await useRoutesStore.getState().fetchStopsForInstance(instanceId);
    },
    isCurrent: () => unitId() === null || fresh(useRoutesStore.getState(), ['plans', 'active']),
  },
  'data.inventory': {
    run: async () => {
      const id = unitId();
      if (id === null) return;
      await Promise.all([useInventoryStore.getState().fetchAccess(id, bypass), useInventoryStore.getState().fetchEquipment(id, bypass)]);
    },
    isCurrent: () => unitId() === null || fresh(useInventoryStore.getState(), ['equipment']),
  },
  'data.incident-command': {
    run: () => useCommandStore.getState().syncFromServer(),
    isCurrent: () => fresh(useCommandStore.getState(), ['sync']),
    dependsOn: ['data.calls'],
  },
  'data.custom-maps': {
    run: async () => {
      await Promise.all([useCustomMapsStore.getState().fetchCustomMaps(), useCustomMapsStore.getState().fetchIndoorMaps(), useCustomMapsStore.getState().fetchActiveLayers()]);
    },
    isCurrent: () => fresh(useCustomMapsStore.getState(), ['customMaps', 'indoorMaps']),
  },
};

export interface HydrationRegistryLike {
  registerHydrationStep(step: HydrationStep): () => void;
}

/** Registers one shift-start hydration step per data store in the variant's scope (plan §8.4). */
export function registerDataHydrationSteps(sync: HydrationRegistryLike, manifest: VariantManifest): () => void {
  const scope = resolveDataOfflineScope(manifest);
  const disposers = scope.hydration.map((id) => {
    const definition = STEPS[id];
    return sync.registerHydrationStep({
      id,
      required: scope.required.includes(id),
      run: async (context) => {
        await definition.run();
        context.reportProgress(1);
      },
      isCurrent: definition.isCurrent,
      ...(definition.dependsOn ? { dependsOn: definition.dependsOn.filter((dependency) => scope.hydration.includes(dependency)) } : {}),
    });
  });
  return () => disposers.forEach((dispose) => dispose());
}

/**
 * Reconnect "pull deltas" for the data layer (plan §8.4): re-fetches the variant's working set, bypassing
 * caches, then moves any legacy chat outbox items into the durable outbox. Wire as `ReconnectSequence.pullDeltas`.
 */
export async function refreshDataWorkingSet(manifest: VariantManifest): Promise<void> {
  const scope = resolveDataOfflineScope(manifest);
  await Promise.allSettled(scope.hydration.map((id) => STEPS[id].run()));
  await useChatStore.getState().importLegacyOutbox();
}

export const getDataHydrationStep = (id: DataHydrationStepId): StepDefinition => STEPS[id];
