// Field Records feature (omni-plan §7.10 "Records, operations — mostly identical; I list item, attachments"; RMS plan
// RMS-1D and §4.1): home, new (catalog → schema-driven form), detail (save / submit / finalize), deployments and
// connectors, the call-detail Records tab and a contextual quick-create button. Screens are app-agnostic: the records
// context comes from the shell's status context or a registered hook; flags gate at runtime. Route files re-export:
//   export { default } from '@resgrid/features/records/screens/record-detail';

// Screens
export { default as RecordConnectorDetailScreen, type RecordConnectorDetailScreenProps } from './screens/record-connector-detail';
export { default as RecordConnectorsScreen, type RecordConnectorsScreenProps } from './screens/record-connectors';
export { default as RecordDeploymentDetailScreen, type RecordDeploymentDetailScreenProps } from './screens/record-deployment-detail';
export { default as RecordDeploymentsScreen, type RecordDeploymentsScreenProps } from './screens/record-deployments';
export { default as RecordDetailScreen, type RecordDetailScreenProps } from './screens/record-detail';
export { default as RecordNewScreen, type RecordNewScreenProps } from './screens/record-new';
export { default as RecordsHomeScreen, type RecordsHomeScreenProps } from './screens/records-home';

// Components
export { CALL_RECORDS_TAB, CallRecordsTab, type CallRecordsTabProps, isCallRecordsTabVisible } from './components/call-records-tab';
export { ConnectorListItem, ConnectorRunItem, DeploymentFillItem, DeploymentListItem, ReconciliationListItem, RecordsEntryRow, type RecordsEntryRowProps } from './components/deployment-items';
export { RecordAttachments, type RecordAttachmentsProps } from './components/record-attachments';
export { RecordField, type RecordFieldProps } from './components/record-field';
export { RecordForm, type RecordFormProps } from './components/record-form';
export { AssignmentItem, type AssignmentItemProps, PendingDraftItem, type PendingDraftItemProps, RecordListItem, type RecordListItemProps, recordStateName } from './components/record-list-item';
export { CheckRow, type CheckRowProps, ContentFrame, DetailRow, EmptyRow, Notice, RecordsSection } from './components/records-layout';
export { RecordsQuickCreate, type RecordsQuickCreateProps } from './components/records-quick-create';

// Hooks
export { type RecordState, useRecord } from './hooks/use-record';
export { type RecordsContextHook, registerRecordsContextHook, useDefaultRecordsContext, useRecordsContext } from './hooks/use-records-context';
export { useRecordsFieldStatus } from './hooks/use-records-field-status';

// Pure helpers
export { readableDefinitionKey, useDefinitionDisplayName } from './lib/definition-name';
export * from './lib/deployment-format';
export { type DraftSendOutcome, isAcknowledgedDraft, needsPush, newClientRecordId, settlePendingDrafts, stageAndSendDraft, visiblePendingDrafts } from './lib/drafts';
export * from './lib/record-schema';

// Runtime (app-shell composition)
export { configureRecords, getRecordsOutbox, type LegalCommandOutcome, type RecordsOutboxControls, type RecordsRuntime, runLegalCommand } from './runtime';

// Routes and nav
export { recordsNav, type RecordsNavEntry } from './nav';
export { RECORD_ROUTE_PATTERNS, recordConnector, recordConnectors, recordDeployment, recordDeployments, recordDetail, recordNew, recordRoutes, recordsHome } from './routes';
