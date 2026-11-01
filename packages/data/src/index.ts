// @resgrid/data (layer L4) — the domain zustand stores shared by all five apps, persisted for offline,
// with outbox handlers for writes in each variant's offline scope (omni-plan §5.5, §7.4, §8).
// Imports only config, models, core-free helpers, api and offline: never auth, realtime, i18n, UI or
// React Native UI APIs. View state (filters, selection, sort) lives in @resgrid/features.

// Composition
export { configureData, type ConfigureDataOptions } from './configure';
export { assertV4Success, type Enveloped, unwrapItem, unwrapList } from './core/envelope';
export { type DataError, type DataErrorCode, isConnectivityError, toDataError } from './core/errors';
export { classifyDataWriteError, defineDataHandler, drainOrderGroup, submitWrite, type WriteOutcome, type WriteResult } from './core/outbox';
export { type DataPersistConfig, dataPersistOptions, getDataStorageKv, getPersistedStoreNames, registerPersistedStore, rehydrateDataStores, setDataStorage } from './core/persist';
export { registerDataStoreReset } from './core/reset';
export {
  type DataLocationFix,
  type DataLogEntry,
  type DataLogger,
  DataNotConfiguredError,
  dataNow,
  type DataOutbox,
  type DataSessionScope,
  defaultIdGenerator,
  generateDataId,
  getDataApiContext,
  getDataLocationFix,
  getDataLogger,
  getDataOutbox,
  getDataSessionScope,
  getDataVariant,
  hasDataApiContext,
  hasDataOutbox,
  noopDataLogger,
  resetDataRuntimeForTests,
  setDataApiContext,
  setDataClock,
  setDataIdGenerator,
  setDataLocationProvider,
  setDataLogger,
  setDataOutbox,
  setDataSessionScopeProvider,
  setDataVariant,
} from './core/runtime';
export { cacheOptions, createSliceRunner, emptySliceMeta, type FetchOptions, isSliceFresh, type SliceMeta, type SliceResult } from './core/slices';
export { gpsFields, statusTimestamps } from './core/status-fields';

// Offline scope
export {
  ALL_DATA_OUTBOX_HANDLERS,
  getDataHydrationStep,
  type HandlerRegistryLike,
  HYDRATION_MAX_AGE_MS,
  type HydrationRegistryLike,
  refreshDataWorkingSet,
  registerDataHydrationSteps,
  registerDataOutboxHandlers,
} from './offline-scope/register';
export { type DataHydrationStepId, type DataOfflineScope, type DataOutboxType, resolveDataOfflineScope } from './offline-scope/scope';

// Calls
export { callCreateHandler, DUPLICATE_CALL_WINDOW_MS, type IdempotentNewCallInput } from './calls/call-create-handler';
export {
  type AddCallNoteInput,
  CALL_DETAIL_CACHE_LIMIT,
  CALL_FILE_UPLOAD_EVENT,
  CALL_NOTE_ADD_EVENT,
  type CallDetailRecord,
  type CallDetailState,
  CallFileKind,
  type CallFilePayload,
  type CallFileReader,
  type CallNoteListItem,
  type CallNotePayload,
  type QueueCallFileInput,
  type QueuedCallFile,
  type QueuedCallNote,
  type QueuedWriteState,
  searchCallNotes,
  selectCallNotes,
  setCallFileReader,
  useCallDetailStore,
} from './calls/call-detail-store';
export { type CallVideoFeedsState, useCallVideoFeedsStore } from './calls/call-video-feeds-store';
export { callFileUploadHandler, callNoteAddHandler } from './calls/call-write-handlers';
export {
  CALL_CREATE_EVENT,
  CALL_DISPATCHES_TTL_MS,
  CALL_EXTRAS_PREFETCH_CONCURRENCY,
  type CallCreatePayload,
  type CallListItem,
  callLoggedOnMs,
  type CallsState,
  configureCallsCachePolicy,
  isCallActiveState,
  type LocalCallMarker,
  migrateCallsStorage,
  type QueuedCall,
  type QueuedCallState,
  queuedCallToListItem,
  selectActiveCalls,
  selectCallById,
  selectCallListWithQueued,
  selectPriorityById,
  selectUnacknowledgedSyncedCalls,
  SYNCED_CALL_NOTICE_TTL_MS,
  type SyncedCallNotice,
  useCallsStore,
} from './calls/calls-store';
export {
  CHECK_IN_PERFORM_EVENT,
  CHECK_IN_STATUS_SEVERITY,
  checkInPerformHandler,
  type CheckInTimersState,
  enrichTimerNames,
  isOverdueOrWarning,
  type PerformCheckInRequest,
  type QueuedCheckIn,
  sortByCheckInSeverity,
  useCheckInTimersStore,
} from './calls/check-in-timers-store';

// Units and personnel
export {
  PERSONNEL_STAFFING_SET_EVENT,
  PERSONNEL_STATUS_SET_EVENT,
  personnelStaffingOrderKey,
  personnelStaffingSetHandler,
  personnelStatusOrderKey,
  personnelStatusSetHandler,
  type PersonnelStatusState,
  type QueuedPersonnelWrite,
  type QueuedPersonnelWriteKind,
  selectPendingPersonnelWrite,
  type SetPersonnelStaffingInput,
  type SetPersonnelStatusInput,
  usePersonnelStatusStore,
} from './personnel/personnel-status-store';
export { isStationGroup, personnelFullName, type PersonnelState, usePersonnelStore } from './personnel/personnel-store';
export { type UnitRolesState, useUnitRolesStore } from './units/unit-roles-store';
export {
  isNoCallSentinel,
  isNoStationSentinel,
  type QueuedUnitStatus,
  selectPendingUnitStatus,
  type SetUnitStatusInput,
  UNIT_DESTINATIONS_TTL_MS,
  UNIT_STATUS_SET_EVENT,
  type UnitStatusDestinations,
  unitStatusOrderKey,
  unitStatusSetHandler,
  type UnitStatusState,
  useUnitStatusStore,
} from './units/unit-status-store';
export { selectUnitById, selectUnitCurrentStatus, type UnitsState, useUnitsStore } from './units/units-store';

// Reference and department data
export { CalendarAttendingType, type CalendarState, useCalendarStore } from './calendar/calendar-store';
export { type CertificationsState, useCertificationsStore } from './certifications/certifications-store';
export { type ChecklistsState, useChecklistsStore } from './checklists/checklists-store';
export { type ContactsState, useContactsStore } from './contacts/contacts-store';
export { type CustomMapsState, useCustomMapsStore } from './mapping/custom-maps-store';
export { type NotesState, searchNotes, useNotesStore } from './notes/notes-store';
export { type PoisState, selectPoiById, usePoisStore } from './pois/pois-store';
export { type ProtocolsState, useProtocolsStore } from './protocols/protocols-store';
export {
  canAdministerWeatherAlerts,
  filterWeatherAlerts,
  isSevereWeatherAlert,
  isWeatherAlertActive,
  selectSevereAlerts,
  sortWeatherAlerts,
  useWeatherAlertsStore,
  type WeatherAlertSort,
  type WeatherAlertsState,
} from './weather-alerts/weather-alerts-store';

// Communication
export {
  CHAT_MESSAGE_SEND_EVENT,
  CHAT_PAGE_SIZE,
  chatMessageSendHandler,
  type ChatSendArgs,
  type ChatSendPayload,
  type ChatState,
  type IncidentChannelsStatus,
  PENDING_SEQ_BASE,
  selectChatUnreadTotal,
  upsertChatMessage,
  useChatStore,
} from './chat/chat-store';
export { MESSAGE_SEND_EVENT, MESSAGES_MAX_ROWS, MESSAGES_RETENTION_MS, messageSendHandler, type MessagesState, type QueuedMessage, retainMessages, useMessagesStore } from './messages/messages-store';

// Member modules
export { type ShiftActionOutcome, type ShiftRefreshScope, type ShiftsState, toShiftOutcome, useShiftsStore } from './shifts/shifts-store';
export { useWorkOrdersStore, WORK_ORDER_REPORT_EVENT, workOrderReportHandler, type WorkOrdersState } from './work-orders/work-orders-store';

// Field modules
export { INVENTORY_COUNT_SAVE_EVENT, inventoryCountCoalesceKey, inventoryCountSaveHandler, type InventoryCountSavePayload, type InventoryState, useInventoryStore } from './inventory/inventory-store';
export {
  EXPENSE_SAVE_EVENT,
  expenseSaveHandler,
  type OperationsState,
  type OperationsWritePayload,
  TIME_ENTRIES_SAVE_EVENT,
  timeEntriesSaveHandler,
  timeReportCoalesceKey,
  useOperationsStore,
} from './operations/operations-store';
export { type RecordDeploymentsState, useRecordDeploymentsStore } from './records/record-deployments-store';
export {
  mergeRecentRecords,
  type PendingRecordDraft,
  RECORD_COMMAND_EVENT,
  RECORD_DRAFT_SAVE_EVENT,
  recordCommandHandler,
  type RecordCommandKind,
  type RecordCommandPayload,
  recordDraftSaveHandler,
  RECORDS_CLIENT_CAPABILITY,
  recordsOriginClient,
  type RecordsState,
  selectOpenAssignments,
  selectOwnDrafts,
  selectReturnedRecords,
  useRecordsStore,
} from './records/records-store';
export {
  applyRouteProgress,
  ROUTE_STOP_CHECK_IN_EVENT,
  ROUTE_STOP_CHECK_OUT_EVENT,
  ROUTE_STOP_SKIP_EVENT,
  RouteInstanceStatus,
  type RouteProgressCounts,
  type RoutesState,
  routeStopCheckInHandler,
  RouteStopCheckInType,
  routeStopCheckOutHandler,
  routeStopOrderKey,
  routeStopSkipHandler,
  RouteStopStatus,
  type RouteStopWritePayload,
  useRoutesStore,
} from './routes/routes-store';

// Incident command
export { incidentCommandHandlers } from './incident-command/command-handlers';
export {
  type BoardCollection,
  type CommandBoardState,
  type CommandState,
  type EndCommandOptions,
  type EndCommandResult,
  IC_EVENT,
  type IcEventPayload,
  type IcEventType,
  incidentOrderKey,
  type PendingLocalRow,
  selectActiveBoard,
  useCommandStore,
  withPendingLocalRows,
} from './incident-command/command-store';
export { type AssistantMessage, type IncidentAssistantState, type ResourceViewState, useIncidentAssistantStore, useResourceViewStore } from './incident-command/resource-view-store';
