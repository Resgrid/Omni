import { getAllProtocols, getProtocol } from '@resgrid/api';
import { GetAllProtocolsResult, GetProtocolResult, type ProtocolResultData } from '@resgrid/models';
import { defaultResetRegistry } from '@resgrid/offline';

import { createDataTestRuntime, type DataTestRuntime, persisted } from '../../__tests__/helpers';
import { setDataStorage } from '../../core/persist';
import { toCallProtocol } from '../protocol-wire';
import { useProtocolsStore } from '../protocols-store';

jest.mock('@resgrid/api', () => ({
  ...jest.requireActual('@resgrid/api'),
  getAllProtocols: jest.fn(),
  getProtocol: jest.fn(),
}));

/** A protocol exactly as Core's `Protocols` controller serializes it (`ProtocolResultData`). */
const wireProtocol = (ProtocolId: string, overrides: Partial<ProtocolResultData> = {}): ProtocolResultData => ({
  ProtocolId,
  DepartmentId: 42,
  Name: `Protocol ${ProtocolId}`,
  Code: `P${ProtocolId}`,
  IsDisabled: false,
  Description: 'Desc',
  ProtocolText: '<p>Text</p>',
  CreatedOn: '2026-10-01T10:00:00',
  CreatedByUserId: 'u1',
  UpdatedOn: null,
  MinimumWeight: 5,
  UpdatedByUserId: '',
  Triggers: [{ ProtocolTriggerId: 't1', Type: 1, StartsOn: null, EndsOn: null, Priority: null, CallType: 'Fire', Geofence: '' }],
  Attachments: [{ ProtocolTriggerAttachmentId: 'a1', FileName: 'card.pdf', FileType: 'application/pdf' }],
  Questions: [{ ProtocolTriggerQuestionId: 'q1', Question: 'Smoke?', Answers: [{ ProtocolQuestionAnswerId: 'qa1', Answer: 'Yes', Weight: 3 }] }],
  State: 0,
  ...overrides,
});

const listAnswer = (Data: ProtocolResultData[]): GetAllProtocolsResult => Object.assign(new GetAllProtocolsResult(), { Data, Status: 'success' });

const detailAnswer = (Data: ProtocolResultData, Status = 'success'): GetProtocolResult => Object.assign(new GetProtocolResult(), { Data, Status });

let runtime: DataTestRuntime;

beforeEach(async () => {
  runtime = await createDataTestRuntime({ variant: 'responder' });
  await defaultResetRegistry.getStoreResets().get('data.protocols')?.('logout');
});

describe('toCallProtocol', () => {
  it('reads the Protocols controller ids (ProtocolId, ProtocolTriggerId…) into the screen shape', () => {
    expect(toCallProtocol(wireProtocol('7'))).toEqual({
      Id: '7',
      DepartmentId: '42',
      Name: 'Protocol 7',
      Code: 'P7',
      Description: 'Desc',
      ProtocolText: '<p>Text</p>',
      CreatedOn: '2026-10-01T10:00:00',
      CreatedByUserId: 'u1',
      IsDisabled: false,
      UpdatedOn: '',
      UpdatedByUserId: '',
      MinimumWeight: 5,
      State: 0,
      Triggers: [{ Id: 't1', Type: 1, StartsOn: '', EndsOn: '', Priority: 0, CallType: 'Fire', Geofence: '' }],
      Attachments: [{ Id: 'a1', FileName: 'card.pdf', FileType: 'application/pdf' }],
      Questions: [{ Id: 'q1', Question: 'Smoke?', Answers: [{ Id: 'qa1', Answer: 'Yes', Weight: 3 }] }],
    });
  });

  it('tolerates the nulls Core sends for empty strings and lists', () => {
    // Core serializes null reference-type fields as JSON null whatever the model declares: read it the way the wire does.
    const sparse: ProtocolResultData = JSON.parse('{"ProtocolId":"8","Name":"Sparse","Code":null,"Description":null,"ProtocolText":null,"Triggers":null,"Attachments":null,"Questions":null}');
    expect(toCallProtocol(sparse)).toMatchObject({ Id: '8', Name: 'Sparse', Code: '', Description: '', ProtocolText: '', DepartmentId: '', Triggers: [], Attachments: [], Questions: [] });
  });

  it('leaves an item already in the screen shape alone', () => {
    const converted = toCallProtocol(wireProtocol('9'));
    expect(toCallProtocol(converted)).toBe(converted);
  });
});

describe('protocols store', () => {
  it('fills the list with ids the protocol page can open', async () => {
    jest.mocked(getAllProtocols).mockResolvedValue(listAnswer([wireProtocol('1'), wireProtocol('2')]));
    await useProtocolsStore.getState().fetchProtocols();
    expect(useProtocolsStore.getState().protocols.map((protocol) => protocol.Id)).toEqual(['1', '2']);
    expect(persisted(runtime.kv, 'omni-protocols-storage')).toMatchObject({ version: 1 });
  });

  it('keeps the single protocol GetProtocol answers in Data', async () => {
    jest.mocked(getProtocol).mockResolvedValue(detailAnswer(wireProtocol('3', { ProtocolText: '<p>Full text</p>' })));
    const detail = await useProtocolsStore.getState().fetchProtocol('3');
    expect(getProtocol).toHaveBeenCalledWith(expect.anything(), { protocolId: '3' });
    expect(detail).toMatchObject({ Id: '3', ProtocolText: '<p>Full text</p>' });
    expect(useProtocolsStore.getState().protocolDetailsById['3']).toMatchObject({ Id: '3' });
  });

  it('a not_found detail keeps nothing (the page keeps showing the listed copy)', async () => {
    jest.mocked(getAllProtocols).mockResolvedValue(listAnswer([wireProtocol('4')]));
    await useProtocolsStore.getState().fetchProtocols();
    jest.mocked(getProtocol).mockResolvedValue(detailAnswer(wireProtocol('4'), 'not_found'));
    const detail = await useProtocolsStore.getState().fetchProtocol('4');
    expect(detail).toBeNull();
    expect(useProtocolsStore.getState().protocolDetailsById).toEqual({});
  });

  it('migrates the v0 copy (raw ProtocolId items) on rehydrate, so a stored protocol opens before any refetch', async () => {
    runtime.kv.set('omni-protocols-storage', JSON.stringify({ state: { protocols: [wireProtocol('5')], protocolDetailsById: {}, fetchedAt: { protocols: 1234 } }, version: 0 }));
    await setDataStorage(runtime.kv);
    const [protocol] = useProtocolsStore.getState().protocols;
    expect(protocol).toMatchObject({ Id: '5', DepartmentId: '42', Name: 'Protocol 5' });
    expect(useProtocolsStore.getState().fetchedAt.protocols).toBe(1234);
  });
});
