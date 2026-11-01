import { ApiError, V4FailureError } from '@resgrid/api';
import type { CallPriorityResultData, DispatchedEventResultData, NewCallFieldRuleData } from '@resgrid/models';

import { readableColors, readableTextColor } from '../lib/call-colors';
import { getDispatchTypeStyle, getUniqueDispatches, isCurrentUserOnCall } from '../lib/call-dispatch';
import { EMPTY_CALL_FILTERS, filterCalls } from '../lib/call-filters';
import { callToFormValues, createRequestToFormValues, dispatchSelectionFromDispatches, emptyCallFormValues, parseCoordinates, toCreateCallRequest, toUpdateCallRequest, validateCallForm } from '../lib/call-form';
import { defaultPriorityId, priorityOptions, resolvePriority } from '../lib/call-priority';
import { isScheduledCall, timeAgo } from '../lib/call-time';
import { getCallCloseErrorMessage, isActiveCommandFor } from '../lib/close-call';
import { createFieldPolicy } from '../lib/field-policy';
import { callCorrect, callDetail, callEdit, callNew } from '../routes';
import { makeCall } from './test-utils';

const dispatch = (overrides: Partial<DispatchedEventResultData>): DispatchedEventResultData =>
  ({ Id: '', Timestamp: '', Type: '', Name: '', GroupId: '', Group: '', Note: '', StatusId: 0, Location: '', StatusText: '', StatusColor: '', ...overrides }) as DispatchedEventResultData;

const rule = (Key: string, Visible: boolean, Required: boolean): NewCallFieldRuleData => ({ Key, Visible, Required });

describe('call colours and priorities', () => {
  it('picks readable text on the priority colour and falls back to grey', () => {
    expect(readableTextColor('#FFFF00')).toBe('#000000');
    expect(readableTextColor('#000080')).toBe('#FFFFFF');
    expect(readableColors('FF0000').backgroundColor).toBe('#FF0000');
    expect(readableColors('not-a-colour')).toEqual({ backgroundColor: '#808080', textColor: '#000000' });
  });

  it('uses department priorities when the department has any, the built-ins otherwise', () => {
    expect(priorityOptions([]).map((option) => option.label)).toEqual(['calls.priorities.low', 'calls.priorities.medium', 'calls.priorities.high', 'calls.priorities.emergency']);
    const department = [
      { Id: 7, Name: 'Code 3', Color: '#ff0000', Sort: 2, IsDeleted: false, IsDefault: false },
      { Id: 5, Name: 'Routine', Color: '#00ff00', Sort: 1, IsDeleted: false, IsDefault: true },
      { Id: 9, Name: 'Old', Color: '', Sort: 0, IsDeleted: true, IsDefault: false },
    ] as CallPriorityResultData[];
    expect(priorityOptions(department).map((option) => option.label)).toEqual(['Routine', 'Code 3']);
    expect(defaultPriorityId(department)).toBe(5);
    expect(resolvePriority(department, 7)?.color).toBe('#ff0000');
    expect(resolvePriority(department, 2)).toBeNull();
  });
});

describe('dispatch helpers', () => {
  it('de-duplicates dispatches by id and by name', () => {
    const list = [
      dispatch({ Id: '1', Type: 'Unit', Name: 'Engine 1' }),
      dispatch({ Id: '1', Type: 'Unit', Name: 'Engine 1' }),
      dispatch({ Id: '', Type: 'User', Name: 'Pat' }),
      dispatch({ Id: '', Type: 'User', Name: 'Pat' }),
    ];
    expect(getUniqueDispatches(list)).toHaveLength(2);
    expect(getDispatchTypeStyle('Personnel').label).toBe('P');
    expect(getDispatchTypeStyle('Station Group').label).toBe('G');
  });

  it('knows when the user is on the call by person, group, role or unit seat', () => {
    const context = { userId: 'u1', groupId: 'g1', roleIds: [], roleNames: ['Medic'], unitIds: ['42'] };
    expect(isCurrentUserOnCall({ Dispatches: [dispatch({ Id: 'u1', Type: 'User' })] }, context)).toBe(true);
    expect(isCurrentUserOnCall({ Dispatches: [dispatch({ Id: 'g1', Type: 'Group' })] }, context)).toBe(true);
    expect(isCurrentUserOnCall({ Dispatches: [dispatch({ Id: 'r9', Name: 'medic', Type: 'Role' })] }, context)).toBe(true);
    expect(isCurrentUserOnCall({ Dispatches: [dispatch({ Id: '42', Type: 'Unit' })] }, context)).toBe(true);
    expect(isCurrentUserOnCall({ Dispatches: [dispatch({ Id: '43', Type: 'Unit' })] }, context)).toBe(false);
    expect(isCurrentUserOnCall(null, context)).toBe(false);
  });
});

describe('time and state', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  it('formats elapsed time from zone-less UTC values', () => {
    expect(timeAgo('2026-10-31T11:59:40', now)).toEqual({ unit: 'just_now', count: 0 });
    expect(timeAgo('2026-10-31T11:15:00Z', now)).toEqual({ unit: 'minutes', count: 45 });
    expect(timeAgo('2026-10-31T09:00:00Z', now)).toEqual({ unit: 'hours', count: 3 });
    expect(timeAgo('2026-10-28T12:00:00Z', now)).toEqual({ unit: 'days', count: 3 });
    expect(timeAgo('', now)).toBeNull();
  });

  it('treats an active call with a future dispatch time as scheduled', () => {
    expect(isScheduledCall(makeCall('1', { DispatchedOnUtc: '2026-11-01T12:00:00Z' }), now)).toBe(true);
    expect(isScheduledCall(makeCall('1', { DispatchedOnUtc: '2026-10-30T12:00:00Z' }), now)).toBe(false);
    expect(isScheduledCall(makeCall('1', { State: 8, DispatchedOnUtc: '2026-11-01T12:00:00Z' }), now)).toBe(false);
  });
});

describe('call filters', () => {
  const calls = [makeCall('1', { Priority: 0, Name: 'Structure fire' }), makeCall('2', { Priority: 3, Name: 'Medical', Nature: '<b>chest</b> pain', Type: 'EMS' }), makeCall('3', { Name: 'REDACTED' })];
  it('searches plain text (tags stripped, protected values never match) and filters by priority and type', () => {
    expect(filterCalls(calls, { ...EMPTY_CALL_FILTERS, query: 'chest pain' }).map((call) => call.CallId)).toEqual(['2']);
    expect(filterCalls(calls, { ...EMPTY_CALL_FILTERS, query: 'redacted' })).toHaveLength(0);
    expect(filterCalls(calls, { ...EMPTY_CALL_FILTERS, priorityIds: [0] }).map((call) => call.CallId)).toEqual(['1']);
    expect(filterCalls(calls, { ...EMPTY_CALL_FILTERS, types: ['EMS'] }).map((call) => call.CallId)).toEqual(['2']);
  });
});

describe('new-call field policy', () => {
  it('is fail-open without rules', () => {
    const policy = createFieldPolicy(null);
    expect(policy.isVisible('contactName')).toBe(true);
    expect(policy.isRequired('contactName')).toBe(false);
    expect(policy.missingRequired({})).toEqual([]);
  });

  it('hides, requires and never requires a hidden field or a plus code', () => {
    const policy = createFieldPolicy([rule('ContactName', true, true), rule('externalId', false, true), rule('pluscode', true, true), rule('note', false, false)]);
    expect(policy.isVisible('note')).toBe(false);
    expect(policy.isRequired('contactName')).toBe(true);
    expect(policy.isRequired('externalId')).toBe(false);
    expect(policy.isRequired('pluscode')).toBe(false);
    expect(policy.missingRequired({ contactName: '  ' })).toEqual(['contactName']);
    expect(policy.missingRequired({ contactName: 'Pat' })).toEqual([]);
  });
});

describe('call form', () => {
  const policy = createFieldPolicy([rule('address', true, true), rule('dispatchList', true, true)]);

  it('validates required basics, coordinates and the department policy', () => {
    const result = validateCallForm({ ...emptyCallFormValues(null), coordinates: '91, 10' }, { policy, validPriorityIds: [0, 1] });
    expect(result.isValid).toBe(false);
    expect(result.errors).toMatchObject({ name: 'calls.validation.name_required', nature: 'calls.validation.nature_required', priority: 'calls.invalid_priority', coordinates: 'calls.coordinates_out_of_range' });
    expect(result.missingPolicyFields).toEqual(['address', 'dispatchList']);
  });

  it('requires custom fields marked required', () => {
    const fields = [{ UdfFieldId: 'f1', IsEnabled: true, IsRequired: true, IsReadOnly: false }] as never;
    const values = { ...emptyCallFormValues(1), name: 'A', nature: 'B', address: 'x', dispatch: { everyone: true, users: [], groups: [], roles: [], units: [] } };
    expect(validateCallForm(values, { policy, udfFields: fields, validPriorityIds: [1] }).missingUdfFields).toEqual(['f1']);
    expect(validateCallForm({ ...values, udfValues: [{ UdfFieldId: 'f1', Value: 'ok' }] }, { policy, udfFields: fields, validPriorityIds: [1] }).isValid).toBe(true);
  });

  it('leaves out properties the client has no picker for, and sends a pending call without a dispatch time', () => {
    const values = { ...emptyCallFormValues(2), name: 'Fire', nature: 'Smoke', coordinates: '39.1, -104.8', dispatchOnUtc: '2026-11-02T10:00:00.000Z', protocolIds: [3] };
    const quick = toCreateCallRequest(values, { protocols: false, linkedCall: false, udf: false, contact: false });
    expect(quick).not.toHaveProperty('protocolIds');
    expect(quick).not.toHaveProperty('linkedCallId');
    expect(quick).not.toHaveProperty('udfValues');
    expect(quick).toMatchObject({ latitude: 39.1, longitude: -104.8, dispatchOnUtc: '2026-11-02T10:00:00.000Z' });
    const full = toCreateCallRequest({ ...values, isPending: true }, { protocols: true, linkedCall: true, udf: true, contact: true });
    expect(full).toMatchObject({ protocolIds: [3], linkedCallId: '', udfValues: [], isPending: true });
    expect(full).not.toHaveProperty('dispatchOnUtc');
  });

  it('starts an edit from the call, hidden fields included, and resends them', () => {
    const call = makeCall('9', { ContactName: 'Hidden Contact', ExternalId: 'EXT-1', Latitude: '39.5', Longitude: '-105.1' });
    const values = callToFormValues(call, [dispatch({ Id: 'u1', Type: 'User' }), dispatch({ Id: '4', Type: 'Unit' })]);
    expect(values).toMatchObject({ contactName: 'Hidden Contact', externalId: 'EXT-1', coordinates: '39.5, -105.1', dispatch: { users: ['u1'], units: ['4'] } });
    expect(toUpdateCallRequest('9', values, { protocols: false, linkedCall: false, udf: false, contact: false })).toMatchObject({ callId: '9', contactName: 'Hidden Contact', externalId: 'EXT-1' });
  });

  it('round-trips a refused request into the correction form', () => {
    const request = toCreateCallRequest(
      { ...emptyCallFormValues(1), name: 'A', nature: 'B', dispatch: { everyone: false, users: ['u1'], groups: [], roles: [], units: [] } },
      { protocols: false, linkedCall: false, udf: false, contact: false }
    );
    expect(createRequestToFormValues(request)).toMatchObject({ name: 'A', nature: 'B', priority: 1, dispatch: { users: ['u1'] } });
    expect(dispatchSelectionFromDispatches([dispatch({ Id: 'g', Type: 'Group' }), dispatch({ Id: 'r', Type: 'Role' })])).toMatchObject({ groups: ['g'], roles: ['r'] });
  });

  it('parses coordinates', () => {
    expect(parseCoordinates('39.7, -104.9')).toEqual({ ok: true, latitude: 39.7, longitude: -104.9 });
    expect(parseCoordinates('39.7 -104.9')).toMatchObject({ ok: true });
    expect(parseCoordinates('abc')).toEqual({ ok: false, reason: 'invalid_format' });
    expect(parseCoordinates('')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('close call', () => {
  it('shows the server reason for a refused close and nothing for other failures', () => {
    const refused = new ApiError({ kind: 'http', status: 400, data: 'This call has an active incident command.' });
    expect(getCallCloseErrorMessage(refused)).toBe('This call has an active incident command.');
    expect(getCallCloseErrorMessage(new ApiError({ kind: 'http', status: 400, data: { Message: 'Nope' } }))).toBe('Nope');
    expect(getCallCloseErrorMessage(new ApiError({ kind: 'http', status: 500, data: 'boom' }))).toBeNull();
    expect(getCallCloseErrorMessage(new ApiError({ kind: 'http', status: 400, data: '<html></html>' }))).toBeNull();
    expect(getCallCloseErrorMessage(new V4FailureError({ Status: 'failure' } as never))).toBeNull();
  });

  it('matches an active command by call id', () => {
    expect(isActiveCommandFor({ CallId: 12, Status: 0 }, '12')).toBe(true);
    expect(isActiveCommandFor({ CallId: 12, Status: 1 }, '12')).toBe(false);
  });
});

describe('routes', () => {
  it('builds canonical call routes and refuses unsafe ids', () => {
    expect(callDetail('42')).toBe('/call/42');
    expect(callEdit('42')).toBe('/call/42/edit');
    expect(callNew()).toBe('/call/new');
    expect(callCorrect('abc-123')).toBe('/call/new?correct=abc-123');
    expect(() => callDetail('../secrets')).toThrow();
  });
});
