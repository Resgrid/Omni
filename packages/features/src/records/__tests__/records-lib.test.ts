import '../../calls/__tests__/test-setup';

import { type PendingRecordDraft, useRecordsStore } from '@resgrid/data';
import { type RecordDefinitionSchema, type RecordDeploymentData, RmsFieldClassification, RmsFieldType, RmsRuleEffect, RmsRuleOperator } from '@resgrid/models';

import { readableDefinitionKey } from '../lib/definition-name';
import { countBy, deploymentStatusAction, fillStatusAction, isConnectorOwned, openDeploymentCount, sortDeployments, statusKey } from '../lib/deployment-format';
import { isAcknowledgedDraft, needsPush, settlePendingDrafts, stageAndSendDraft, visiblePendingDrafts } from '../lib/drafts';
import { canAuthorOffline, cellKey, evaluateRules, rowKeysFor, toValueList, toValueMap, unsupportedFieldKeys, validate, withheldCellKeys } from '../lib/record-schema';
import { recordDetail, recordNew } from '../routes';
import { configureRecords, resetRecordsRuntimeForTests, runLegalCommand } from '../runtime';

const field = (Key: string, Type: RmsFieldType, extra: Partial<RecordDefinitionSchema['Sections'][number]['Fields'][number]> = {}) => ({
  Key,
  Label: Key,
  Type,
  Classification: RmsFieldClassification.Standard,
  ...extra,
});

const schema: RecordDefinitionSchema = {
  Sections: [
    {
      Key: 'main',
      Label: 'Main',
      Fields: [
        field('kind', RmsFieldType.SingleSelect, { Required: true, Options: [{ Key: 'fire', Label: 'Fire' }] }),
        field('cause', RmsFieldType.ShortText, { Rules: [{ Effect: RmsRuleEffect.Show, Condition: { Operator: RmsRuleOperator.Equals, FieldKey: 'kind', Value: 'fire' } }] }),
        field('count', RmsFieldType.Integer, { Min: 0, Max: 10 }),
        field('secret', RmsFieldType.ShortText, { Required: true, Classification: RmsFieldClassification.Protected }),
        field('signed', RmsFieldType.Signature, { RequiredToFinalize: true }),
      ],
    },
    { Key: 'crew', Label: 'Crew', Repeating: true, Fields: [field('name', RmsFieldType.ShortText, { Required: true })] },
  ],
};

const draft = (clientRecordId: string, extra: Partial<PendingRecordDraft> = {}): PendingRecordDraft => ({
  clientRecordId,
  recordId: null,
  definitionKey: 'system.run',
  definitionVersion: 1,
  name: 'Run',
  values: [],
  updatedOn: '2026-10-31T10:00:00Z',
  ...extra,
});

describe('record schema', () => {
  it('hides a field whose show rule is not met and requires to finalize only when finalizing', () => {
    const empty = evaluateRules(schema, {});
    expect(empty.hiddenFieldKeys.has(cellKey('main', 'cause', null))).toBe(true);
    const values = { [cellKey('main', 'kind', null)]: { SectionKey: 'main', FieldKey: 'kind', Value: 'fire' } };
    expect(evaluateRules(schema, values).hiddenFieldKeys.has(cellKey('main', 'cause', null))).toBe(false);
    const issues = validate(schema, values, false).map((issue) => issue.fieldKey);
    expect(issues).toEqual(['secret']);
    expect(validate(schema, values, true).map((issue) => issue.fieldKey)).toEqual(['secret', 'signed']);
  });

  it('validates ranges and repeating rows per row', () => {
    const values = {
      [cellKey('main', 'kind', null)]: { SectionKey: 'main', FieldKey: 'kind', Value: 'fire' },
      [cellKey('main', 'count', null)]: { SectionKey: 'main', FieldKey: 'count', Value: '42' },
      [cellKey('main', 'secret', null)]: { SectionKey: 'main', FieldKey: 'secret', Value: 'x' },
      [cellKey('crew', 'name', 'r1')]: { SectionKey: 'crew', FieldKey: 'name', RowKey: 'r1', Ordinal: 0, Value: '' },
    };
    expect(rowKeysFor(values, 'crew')).toEqual(['r1']);
    expect(validate(schema, values, false).map((issue) => `${issue.fieldKey}:${issue.code}`)).toEqual(['count:range', 'name:required']);
  });

  it('keeps withheld cells out of the form, out of validation and out of every save', () => {
    const cells = [
      { SectionKey: 'main', FieldKey: 'kind', Value: 'fire' },
      { SectionKey: 'main', FieldKey: 'secret', Value: 'REDACTED', IsWithheld: true },
    ];
    const values = toValueMap(cells);
    const withheld = withheldCellKeys(cells);
    expect(Object.keys(values)).toEqual([cellKey('main', 'kind', null)]);
    expect(withheld.has(cellKey('main', 'secret', null))).toBe(true);
    expect(validate(schema, values, false, withheld)).toEqual([]);
    const tampered = { ...values, [cellKey('main', 'secret', null)]: { SectionKey: 'main', FieldKey: 'secret', Value: 'REDACTED' } };
    expect(toValueList(tampered, withheld).map((value) => value.FieldKey)).toEqual(['kind']);
    expect(toValueList(tampered).map((value) => value.FieldKey)).toEqual(['kind']);
  });

  it('fails closed on unknown field types and never authors a sealed definition offline', () => {
    expect(unsupportedFieldKeys({ Sections: [{ Key: 's', Label: 's', Fields: [field('x', 99 as RmsFieldType)] }] })).toEqual(['x']);
    expect(canAuthorOffline({ AllowOffline: true, RequiresProtectedGrant: true } as never)).toBe(false);
    expect(canAuthorOffline({ AllowOffline: true, RequiresProtectedGrant: false } as never)).toBe(true);
    expect(readableDefinitionKey('system.unit-activity')).toBe('Unit activity');
  });
});

describe('deployment format', () => {
  const order = (OrderId: string, Status: string, ModifiedOn: string): RecordDeploymentData => ({ OrderId, Status, ModifiedOn, OrderNumber: OrderId, Fills: [] }) as unknown as RecordDeploymentData;

  it('maps statuses, ownership and counts', () => {
    expect(statusKey('CheckedIn')).toBe('checked_in');
    expect(deploymentStatusAction('Open')).toBe('info');
    expect(fillStatusAction('Declined')).toBe('error');
    expect(isConnectorOwned({ OwnershipMarker: 'Connector' })).toBe(true);
    expect(openDeploymentCount([order('a', 'Open', '1'), order('b', 'ClosedOut', '2')])).toBe(1);
    expect(sortDeployments([order('a', 'Open', '2026-01-01'), order('b', 'Open', '2026-02-01')]).map((entry) => entry.OrderId)).toEqual(['b', 'a']);
    expect(countBy([{ OrderId: 'a', ConnectorId: 'c' } as never, { OrderId: 'a', ConnectorId: null } as never], 'ConnectorId')).toEqual({ c: 1 });
  });
});

describe('routes', () => {
  it('builds record routes only from safe ids', () => {
    expect(recordDetail('abc-1')).toBe('/records/abc-1');
    expect(recordNew('d1')).toBe('/records/new?draft=d1');
    expect(() => recordDetail('../x')).toThrow();
  });
});

describe('drafts', () => {
  beforeEach(() => useRecordsStore.setState({ pendingDrafts: {} }));

  it('lists unsent and refused drafts, never acknowledged ones', () => {
    const drafts = { a: draft('a'), b: draft('b', { queued: false, recordId: 'r1' }), c: draft('c', { conflict: 'etag' }) };
    expect(
      visiblePendingDrafts(drafts)
        .map((entry) => entry.clientRecordId)
        .sort()
    ).toEqual(['a', 'c']);
    expect(isAcknowledgedDraft(drafts.b)).toBe(true);
    expect(needsPush(drafts.a)).toBe(true);
    expect(needsPush(drafts.c)).toBe(false);
  });

  it('settles: forgets acknowledged drafts and hands never-sent ones to the outbox', async () => {
    const pushDraft = jest.fn(async () => ({ outcome: 'queued' as const, id: 'e1' }));
    useRecordsStore.setState({ pendingDrafts: { a: draft('a'), b: draft('b', { queued: false, recordId: 'r1' }), c: draft('c', { queued: true }) }, pushDraft });
    await settlePendingDrafts();
    expect(pushDraft).toHaveBeenCalledTimes(1);
    expect(pushDraft).toHaveBeenCalledWith('a');
    expect(Object.keys(useRecordsStore.getState().pendingDrafts).sort()).toEqual(['a', 'c']);
  });

  it('stages and sends: a sent draft leaves the device and returns the server record id', async () => {
    useRecordsStore.setState({
      pushDraft: jest.fn(async (id: string) => {
        useRecordsStore.getState().applyDraftResult(id, { RecordId: 'r9', RowVersion: 2, DefinitionVersion: 1, State: 1 });
        return { outcome: 'sent' as const, id: 'e1' };
      }),
    });
    expect(await stageAndSendDraft(draft('n1'))).toEqual({ kind: 'sent', recordId: 'r9' });
    expect(useRecordsStore.getState().pendingDrafts.n1).toBeUndefined();
  });

  it('keeps a queued draft on the device', async () => {
    useRecordsStore.setState({ pushDraft: jest.fn(async () => ({ outcome: 'queued' as const, id: 'e1' })) });
    expect(await stageAndSendDraft(draft('n2'))).toEqual({ kind: 'queued' });
    expect(useRecordsStore.getState().pendingDrafts.n2).toBeDefined();
  });
});

describe('legal commands (requiresOnlineAuth)', () => {
  afterEach(() => resetRecordsRuntimeForTests());

  it('confirms and delivers at once when online and the outbox is wired', async () => {
    const confirmOnlineAuth = jest.fn(async () => true);
    configureRecords({ outbox: { confirmOnlineAuth, drain: async () => ({ sent: ['e1'], dead: [] }) } });
    expect(await runLegalCommand(async () => ({ outcome: 'queued', id: 'e1' }), true)).toBe('sent');
    expect(confirmOnlineAuth).toHaveBeenCalledWith('e1');
  });

  it('never confirms offline: the command waits for the person in Pending sync', async () => {
    const confirmOnlineAuth = jest.fn(async () => true);
    configureRecords({ outbox: { confirmOnlineAuth, drain: async () => ({ sent: [], dead: [] }) } });
    expect(await runLegalCommand(async () => ({ outcome: 'queued', id: 'e1' }), false)).toBe('awaiting_confirmation');
    expect(confirmOnlineAuth).not.toHaveBeenCalled();
  });

  it('reports a refusal', async () => {
    configureRecords({ outbox: { confirmOnlineAuth: async () => true, drain: async () => ({ sent: [], dead: ['e1'] }) } });
    expect(await runLegalCommand(async () => ({ outcome: 'queued', id: 'e1' }), true)).toBe('rejected');
  });
});
