import '../../calls/__tests__/test-setup';

import { featureFlagsStore, securityStore } from '@resgrid/auth';
import { useRecordDeploymentsStore, useRecordsStore } from '@resgrid/data';
import type { CallDetailTabContext } from '@resgrid/features/calls';
import { type FieldRecordCatalogEntry, type RecordData, type RecordDefinitionSchema, type RecordDeploymentData, RmsFieldClassification, RmsFieldType, RmsRecordState } from '@resgrid/models';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';

import { activateVariant } from '../../calls/__tests__/test-utils';
import { CallRecordsTab, isCallRecordsTabVisible } from '../components/call-records-tab';
import { RecordsQuickCreate } from '../components/records-quick-create';
import { configureRecords, resetRecordsRuntimeForTests } from '../runtime';
import RecordConnectorDetailScreen from '../screens/record-connector-detail';
import RecordConnectorsScreen from '../screens/record-connectors';
import RecordDeploymentDetailScreen from '../screens/record-deployment-detail';
import RecordDeploymentsScreen from '../screens/record-deployments';
import RecordDetailScreen from '../screens/record-detail';
import RecordNewScreen from '../screens/record-new';
import RecordsHomeScreen from '../screens/records-home';

const mockFetchRecord = jest.fn();
const mockDeleteAttachment = jest.fn();
jest.mock('../lib/records-api', () => ({
  fetchRecord: (id: string) => mockFetchRecord(id),
  fetchRecordAttachments: jest.fn(async () => [{ AttachmentId: 'a1', FileName: 'photo.jpg', MetadataStripped: true }]),
  deleteRecordAttachment: (recordId: string, attachmentId: string) => mockDeleteAttachment(recordId, attachmentId),
  fetchDepartmentReconciliation: jest.fn(async () => [{ ConnectorId: 'c1', OrderId: 'o1', OrderNumber: 'O-1', Kind: 'source_status_ahead' }]),
}));

const entry = (DefinitionKey: string, extra: Partial<FieldRecordCatalogEntry> = {}): FieldRecordCatalogEntry =>
  ({
    DefinitionKey,
    Version: 1,
    Name: `Def ${DefinitionKey}`,
    Locked: false,
    LaunchContexts: [],
    AllowOffline: true,
    AllowAttachments: true,
    Restricted: false,
    RequiresProtectedGrant: false,
    PrefillVersion: 0,
    SupportsPrefill: false,
    ...extra,
  }) as FieldRecordCatalogEntry;

const catalog = (definitions: FieldRecordCatalogEntry[]) => ({ ContractVersion: 'v1', OriginClient: 'Unit', Ok: true, Reasons: [], ContextVerified: true, Definitions: definitions, Exclusions: [], ServerTimestampMs: 1 });

const schema: RecordDefinitionSchema = {
  Sections: [
    {
      Key: 'main',
      Label: 'Main',
      Fields: [
        { Key: 'summary', Label: 'Summary', Type: RmsFieldType.ShortText, Classification: RmsFieldClassification.Standard, Required: true },
        { Key: 'secret', Label: 'Secret', Type: RmsFieldType.ShortText, Classification: RmsFieldClassification.Protected },
      ],
    },
  ],
};

const record = (extra: Partial<RecordData> = {}): RecordData => ({
  RecordId: 'r1',
  RecordNumber: 'R-001',
  DefinitionKey: 'system.run',
  DefinitionVersion: 1,
  State: RmsRecordState.Draft,
  StateName: 'Draft',
  RowVersion: 3,
  Values: {
    Sections: [
      {
        SectionKey: 'main',
        Rows: [
          {
            Ordinal: 0,
            Cells: [
              { FieldKey: 'summary', Value: 'Smoke' },
              { FieldKey: 'secret', Withheld: true },
            ],
          },
        ],
      },
    ],
  },
  ...extra,
});

const order = (OrderId: string, extra: Partial<RecordDeploymentData> = {}): RecordDeploymentData =>
  ({
    OrderId,
    OrderNumber: `O-${OrderId}`,
    IncidentName: 'Ridge Fire',
    IncidentNumber: 'CA-1',
    SourceScheme: 'iroc',
    Status: 'Open',
    OwnershipMarker: 'connector',
    ModifiedOn: '2026-10-31T10:00:00Z',
    Fills: [{ FillId: 'f1', RequestNumber: 'E-1', Status: 'CheckedIn', IsTrainee: false, RowVersion: 1 }],
    HasArtifact: false,
    AllReturned: false,
    IsPreview: false,
    ...extra,
  }) as RecordDeploymentData;

const enableRecords = () => featureFlagsStore.setState({ flags: { 'Records.System': { enabled: true }, 'Records.Field.Unit': { enabled: true } }, isLoaded: true });

beforeEach(() => {
  jest.useFakeTimers();
  activateVariant('unit');
  enableRecords();
  securityStore.setState({ rights: { IsAdmin: false } as never, isLoaded: true });
  (router.push as jest.Mock).mockClear();
  (router.replace as jest.Mock).mockClear();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  mockFetchRecord.mockReset();
  mockDeleteAttachment.mockReset();
  useRecordsStore.setState({
    catalog: catalog([entry('system.run')]),
    assignments: [],
    recent: [],
    drafts: [],
    pendingDrafts: {},
    context: {},
    loading: {},
    errors: {},
    fetchCatalog: jest.fn(async () => useRecordsStore.getState().catalog),
    sync: jest.fn(async () => undefined),
    fetchSchema: jest.fn(async () => schema),
    prefill: jest.fn(async () => null),
    pushDraft: jest.fn(async () => ({ outcome: 'queued' as const, id: 'e1' })),
    submitForReview: jest.fn(async () => ({ outcome: 'queued' as const, id: 'cmd1' })),
    finalize: jest.fn(async () => ({ outcome: 'queued' as const, id: 'cmd2' })),
  });
  useRecordDeploymentsStore.setState({
    deployments: [order('o1'), order('o2', { Status: 'ClosedOut', ModifiedOn: '2026-10-01T10:00:00Z', OwnershipMarker: 'manual' })],
    connectors: [],
    reconciliation: [],
    runs: {},
    includeClosed: false,
    loading: {},
    errors: {},
    fetchDeployments: jest.fn(async () => useRecordDeploymentsStore.getState().deployments),
    fetchDeployment: jest.fn(async () => null),
    fetchConnectors: jest.fn(async () => [{ Id: 'c1', Name: 'IROC feed' } as never]),
  });
});

afterEach(async () => {
  await act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
  resetRecordsRuntimeForTests();
});

describe('RecordsHomeScreen', () => {
  it('waits for flags, and shows nothing to start when the department has Field Records off', async () => {
    featureFlagsStore.setState({ flags: { 'Records.System': { enabled: false } }, isLoaded: true });
    await render(<RecordsHomeScreen />);
    expect(screen.getByTestId('records-home-disabled')).toBeTruthy();
  });

  it('loads in the context, lists the sections and offers New when the catalog has definitions', async () => {
    useRecordsStore.setState({
      assignments: [{ AssignmentId: 'as1', RecordId: 'r2', AssigneeKind: 'user', Purpose: 'review', State: 'Open', CreatedOn: '', RowVersion: 1 }],
      drafts: [
        { RecordId: 'd1', State: RmsRecordState.Draft, DefinitionVersion: 1, CreatedOn: '', ModifiedOn: '', RowVersion: 1, RecordNumber: 'D-1' },
        { RecordId: 'd2', State: RmsRecordState.Returned, DefinitionVersion: 1, CreatedOn: '', ModifiedOn: '', RowVersion: 1, RecordNumber: 'D-2' },
      ],
      recent: [{ RecordId: 'x1', State: RmsRecordState.Finalized, DefinitionVersion: 1, CreatedOn: '', ModifiedOn: '', RowVersion: 1, RecordNumber: 'X-1' }],
      pendingDrafts: { local1: { clientRecordId: 'local1', recordId: null, definitionKey: 'system.run', definitionVersion: 1, name: 'Run', values: [], updatedOn: '2026-10-31T10:00:00Z' } },
    });
    await render(<RecordsHomeScreen context={{ CallId: 7 }} />);
    await waitFor(() => expect(useRecordsStore.getState().sync).toHaveBeenCalled());
    expect(useRecordsStore.getState().context).toEqual(expect.objectContaining({ CallId: 7 }));
    // A draft never handed to the outbox is sent on open (legacy pushAllDrafts).
    await waitFor(() => expect(useRecordsStore.getState().pushDraft).toHaveBeenCalledWith('local1'));
    expect(screen.getByTestId('records-assignment-as1')).toBeTruthy();
    expect(screen.getByTestId('records-draft-d1')).toBeTruthy();
    expect(screen.getByTestId('records-returned-d2')).toBeTruthy();
    expect(screen.getByTestId('records-recent-x1')).toBeTruthy();
    expect(screen.getByTestId('records-pending-local1')).toBeTruthy();
    expect(screen.getByTestId('records-deployments-count')).toHaveTextContent('1');
    expect(screen.queryByTestId('records-connectors')).toBeNull();
    await fireEvent.press(screen.getByTestId('records-new-fab'));
    expect(router.push).toHaveBeenCalledWith('/records/new');
    await fireEvent.press(screen.getByTestId('records-returned-d2'));
    expect(router.push).toHaveBeenCalledWith('/records/d2');
  });

  it('shows the catalog refusal reasons and hides New', async () => {
    useRecordsStore.setState({ catalog: { ...catalog([]), Ok: false, Reasons: ['module_disabled'] } });
    await render(<RecordsHomeScreen />);
    expect(screen.getByTestId('records-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('records-new-fab')).toBeNull();
  });

  it('gives department administrators the connectors entry with the reconciliation count', async () => {
    securityStore.setState({ rights: { IsAdmin: true } as never, isLoaded: true });
    await render(<RecordsHomeScreen />);
    await waitFor(() => expect(screen.getByTestId('records-connectors-count')).toHaveTextContent('1'));
  });
});

describe('RecordNewScreen', () => {
  it('picks a definition, validates, then saves and opens the new record', async () => {
    useRecordsStore.setState({
      pushDraft: jest.fn(async (id: string) => {
        useRecordsStore.getState().applyDraftResult(id, { RecordId: 'r77', RowVersion: 1, DefinitionVersion: 1, State: 1 });
        return { outcome: 'sent' as const, id: 'e1' };
      }),
    });
    await render(<RecordNewScreen />);
    await fireEvent.press(screen.getByTestId('records-choose-system.run'));
    await waitFor(() => expect(screen.getByTestId('record-form')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('records-save-send'));
    expect(screen.getByTestId('record-new-message')).toHaveTextContent('records.fix_fields');
    await fireEvent.changeText(screen.getByTestId('records-field-main-summary-input'), 'Smoke showing');
    await fireEvent.press(screen.getByTestId('records-save-send'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/records/r77'));
    expect(useRecordsStore.getState().pendingDrafts).toEqual({});
  });

  it('keeps an offline-capable draft on the device; a sealed definition cannot be kept', async () => {
    useRecordsStore.setState({ catalog: catalog([entry('system.run'), entry('sealed', { RequiresProtectedGrant: true })]) });
    const first = await render(<RecordNewScreen />);
    await fireEvent.press(screen.getByTestId('records-choose-system.run'));
    await waitFor(() => expect(screen.getByTestId('record-form')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('records-field-main-summary-input'), 'Smoke');
    await fireEvent.press(screen.getByTestId('records-save-local'));
    expect(Object.values(useRecordsStore.getState().pendingDrafts)).toHaveLength(1);
    expect(useRecordsStore.getState().pushDraft).not.toHaveBeenCalled();
    await first.unmount();

    await render(<RecordNewScreen />);
    await fireEvent.press(screen.getByTestId('records-choose-sealed'));
    await waitFor(() => expect(screen.getByTestId('record-form')).toBeTruthy());
    expect(screen.getByTestId('records-save-local')).toBeDisabled();
  });

  it('resumes a staged draft and offers to discard one whose definition was retired', async () => {
    useRecordsStore.setState({ pendingDrafts: { old: { clientRecordId: 'old', recordId: null, definitionKey: 'gone', definitionVersion: 1, name: 'Gone', values: [], updatedOn: '' } } });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ draft: 'old' });
    await render(<RecordNewScreen />);
    await fireEvent.press(screen.getByTestId('record-new-discard'));
    expect(useRecordsStore.getState().pendingDrafts.old).toBeUndefined();
  });
});

describe('RecordDetailScreen', () => {
  it('shows withheld cells as protected and never posts them back', async () => {
    mockFetchRecord.mockResolvedValue(record());
    useRecordsStore.setState({
      pushDraft: jest.fn(async () => ({ outcome: 'sent' as const, id: 'e1' })),
    });
    const stageDraft = jest.spyOn(useRecordsStore.getState(), 'stageDraft');
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'r1' });
    await render(<RecordDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('records-field-main-secret-protected')).toBeTruthy());
    expect(screen.queryByText('REDACTED')).toBeNull();
    expect(screen.getByTestId('records-field-main-summary-input')).toHaveProp('value', 'Smoke');
    await fireEvent.changeText(screen.getByTestId('records-field-main-summary-input'), 'Smoke and fire');
    await fireEvent.press(screen.getByTestId('record-save'));
    await waitFor(() => expect(useRecordsStore.getState().pushDraft).toHaveBeenCalledWith('edit-r1-3'));
    const staged = stageDraft.mock.calls[0]?.[0] ?? useRecordsStore.getState().pendingDrafts['edit-r1-3'];
    expect(staged?.values.map((value) => value.FieldKey)).toEqual(['summary']);
    expect(mockFetchRecord).toHaveBeenCalledTimes(2);
  });

  it('finalizes only after attestation, and a legal command waits for confirmation without an outbox', async () => {
    mockFetchRecord.mockResolvedValue(record());
    await render(<RecordDetailScreen recordId="r1" />);
    await waitFor(() => expect(screen.getByTestId('record-finalize')).toBeTruthy());
    expect(screen.getByTestId('record-finalize')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('record-attest'));
    await fireEvent.press(screen.getByTestId('record-finalize'));
    await waitFor(() => expect(useRecordsStore.getState().finalize).toHaveBeenCalledWith('r1', 3, true));
    expect(screen.getByTestId('record-detail-message')).toHaveTextContent('records.command_waiting');
  });

  it('submits for review and delivers at once when online with the outbox wired', async () => {
    mockFetchRecord.mockResolvedValue(record());
    const confirmOnlineAuth = jest.fn(async () => true);
    configureRecords({ outbox: { confirmOnlineAuth, drain: async () => ({ sent: ['cmd1'], dead: [] }) } });
    await render(<RecordDetailScreen recordId="r1" />);
    await waitFor(() => expect(screen.getByTestId('record-submit')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('record-submit'));
    await waitFor(() => expect(screen.getByTestId('record-detail-message')).toHaveTextContent('records.submitted'));
    expect(confirmOnlineAuth).toHaveBeenCalledWith('cmd1');
  });

  it('is read-only once finalized and lists attachments without capture', async () => {
    mockFetchRecord.mockResolvedValue(record({ State: RmsRecordState.Finalized, StateName: 'Finalized' }));
    await render(<RecordDetailScreen recordId="r1" />);
    await waitFor(() => expect(screen.getByTestId('record-detail-state')).toHaveTextContent('Finalized'));
    expect(screen.queryByTestId('record-save')).toBeNull();
    await waitFor(() => expect(screen.getByText('photo.jpg')).toBeTruthy());
    expect(screen.queryByTestId('record-attachment-remove-a1')).toBeNull();
  });

  it('says so when the record is not available', async () => {
    mockFetchRecord.mockResolvedValue(null);
    await render(<RecordDetailScreen recordId="r404" />);
    await waitFor(() => expect(screen.getByTestId('record-detail-missing')).toBeTruthy());
  });
});

describe('deployments and connectors', () => {
  it('lists deployments newest first and toggles closed-out orders', async () => {
    await render(<RecordDeploymentsScreen />);
    expect(screen.getByTestId('deployment-o1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('deployments-toggle-closed'));
    expect(useRecordDeploymentsStore.getState().fetchDeployments).toHaveBeenLastCalledWith({ includeClosed: true });
    await fireEvent.press(screen.getByTestId('deployment-o1'));
    expect(router.push).toHaveBeenCalledWith('/records/deployments/o1');
  });

  it('shows one order with its fills and, for an administrator, its reconciliation', async () => {
    securityStore.setState({ rights: { IsAdmin: true } as never, isLoaded: true });
    await render(<RecordDeploymentDetailScreen orderId="o1" />);
    expect(screen.getByTestId('deployment-fill-f1')).toBeTruthy();
    expect(screen.getByTestId('deployment-connector-owned')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('deployment-reconciliation-0')).toBeTruthy());
  });

  it('keeps connectors to department administrators', async () => {
    await render(<RecordConnectorsScreen />);
    expect(screen.getByTestId('connectors-forbidden')).toBeTruthy();
  });

  it('lets an administrator read a connector feed now and shows the run that was made', async () => {
    securityStore.setState({ rights: { IsAdmin: true } as never, isLoaded: true });
    const connector = {
      Id: 'c1',
      Name: 'IROC feed',
      ProviderKey: 'iroc',
      SourceScheme: 'iroc',
      ProfileKey: 'nwcg',
      BaseUrl: 'https://feed.example',
      IsEnabled: true,
      IsReadyToRun: true,
      ReadEnabled: true,
      RequestsThisHour: 1,
      MaxRequestsPerHour: 10,
      PollIntervalMinutes: 15,
    };
    const ranOk = {
      Id: 'run1',
      ConnectorId: 'c1',
      Trigger: 'manual',
      StartedOn: '2026-10-31T10:00:00Z',
      Outcome: 'ok',
      RequestCount: 1,
      OrdersSeen: 2,
      OrdersCreated: 1,
      SnapshotsRecorded: 2,
      RequestsAdded: 3,
      Unchanged: 0,
      Rejected: 0,
      Conflicts: 0,
      Messages: [],
    };
    useRecordDeploymentsStore.setState({
      connectors: [connector as never],
      fetchConnector: jest.fn(async () => connector as never),
      fetchRuns: jest.fn(async () => []),
      fetchReconciliation: jest.fn(async () => []),
      runConnector: jest.fn(async () => {
        useRecordDeploymentsStore.setState({ runs: { c1: [ranOk as never] } });
        return true;
      }),
    });
    await render(<RecordConnectorDetailScreen connectorId="c1" />);
    expect(screen.getByTestId('connector-state')).toHaveTextContent('records.connector_ready');
    await fireEvent.press(screen.getByTestId('connector-read-now'));
    await waitFor(() => expect(screen.getByTestId('connector-message')).toBeTruthy());
    expect(screen.getByTestId('connector-run-run1')).toBeTruthy();
  });
});

describe('call Records tab and quick create', () => {
  it('is visible only with Records.System and this app child flag', () => {
    const context = (flags: string[]) => ({ variantId: 'unit' as const, isFeatureEnabled: (flag: string) => flags.includes(flag) }) as Pick<CallDetailTabContext, 'variantId' | 'isFeatureEnabled'>;
    expect(isCallRecordsTabVisible(context(['Records.System', 'Records.Field.Unit']))).toBe(true);
    expect(isCallRecordsTabVisible(context(['Records.System']))).toBe(false);
    expect(isCallRecordsTabVisible({ ...context(['Records.System']), variantId: 'bigboard' })).toBe(false);
  });

  it('lists the call records and starts a new one in the call context', async () => {
    useRecordsStore.setState({
      recent: [
        { RecordId: 'x1', CallId: 10, State: RmsRecordState.Finalized, DefinitionVersion: 1, CreatedOn: '', ModifiedOn: '', RowVersion: 1, RecordNumber: 'X-1' },
        { RecordId: 'x2', CallId: 11, State: RmsRecordState.Finalized, DefinitionVersion: 1, CreatedOn: '', ModifiedOn: '', RowVersion: 1, RecordNumber: 'X-2' },
      ],
    });
    await render(<CallRecordsTab callId="10" />);
    expect(screen.getByTestId('call-records-x1')).toBeTruthy();
    expect(screen.queryByTestId('call-records-x2')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('call-records-new')).toBeTruthy());
    expect(useRecordsStore.getState().context).toEqual(expect.objectContaining({ CallId: 10 }));
    await fireEvent.press(screen.getByTestId('call-records-new'));
    expect(router.push).toHaveBeenCalledWith('/records/new');
  });

  it('hides quick create when nothing can be started here', async () => {
    useRecordsStore.setState({ catalog: catalog([]) });
    await render(<RecordsQuickCreate context={{ UnitId: 4 }} />);
    await waitFor(() => expect(useRecordsStore.getState().fetchCatalog).toHaveBeenCalled());
    expect(screen.queryByTestId('records-quick-create')).toBeNull();
  });
});
