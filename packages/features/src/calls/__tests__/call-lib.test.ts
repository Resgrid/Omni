import './test-setup';

import { ApiError, buildEditCallInput, buildNewCallInput, DISPATCH_LIST_NOBODY, V4FailureError } from '@resgrid/api';
import type { CallPriorityResultData, DispatchedEventResultData, NewCallFieldRuleData } from '@resgrid/models';

import { readableColors, readableTextColor } from '../lib/call-colors';
import { getDispatchTypeStyle, getUniqueDispatches, isCurrentUserOnCall } from '../lib/call-dispatch';
import { EMPTY_CALL_FILTERS, filterCalls } from '../lib/call-filters';
import {
  applyCallTemplate,
  callToFormValues,
  coordinateFieldErrors,
  createRequestToFormValues,
  dispatchSelectionFromDispatches,
  emptyCallFormValues,
  isUdfFieldShown,
  missingPolicyFields,
  parseCoordinateFields,
  parseCoordinates,
  parseLatitude,
  parseLongitude,
  toCreateCallRequest,
  toUpdateCallRequest,
  validateCallForm,
} from '../lib/call-form';
import { isWhat3WordsFormat } from '../lib/call-geocoding';
import { defaultPriorityId, priorityOptions, resolvePriority } from '../lib/call-priority';
import { getScheduledDispatchPrefill, isDispatchTimeTooSoon } from '../lib/call-schedule';
import { isClosedCall, isScheduledCall, timeAgo } from '../lib/call-time';
import { getCallCloseErrorMessage, isActiveCommandFor } from '../lib/close-call';
import { buildAddResourcesRequest, dispatchesToSelection, mergeDispatchSelections } from '../lib/dispatch-selection';
import { createFieldPolicy, describeCallFields } from '../lib/field-policy';
import { getMissingCallFieldsFromRefusal } from '../lib/server-refusal';
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

  it('reads a call’s dispatches as a selection (names or P/G/R/U codes) and only ever adds to it', () => {
    const current = dispatchesToSelection([
      dispatch({ Id: 'u1', Type: 'p' }),
      dispatch({ Id: 'g1', Type: 'Groups' }),
      dispatch({ Id: '7', Type: 'Unit' }),
      dispatch({ Id: '7', Type: 'U' }),
      dispatch({ Id: '', Type: 'User' }),
    ]);

    expect(current).toEqual({ everyone: false, users: ['u1'], groups: ['g1'], roles: [], units: ['7'] });
    expect(mergeDispatchSelections(current, { everyone: false, users: [], groups: [], roles: ['r1'], units: ['7', '8'] })).toEqual({ everyone: false, users: ['u1'], groups: ['g1'], roles: ['r1'], units: ['7', '8'] });
    const request = buildAddResourcesRequest(makeCall('5', { Geolocation: '39.1,-104.2' }), current, { everyone: false, users: [], groups: [], roles: [], units: ['8'] }, { callFormData: '{"a":1}' });
    expect(request).toMatchObject({ callId: '5', latitude: 39.1, longitude: -104.2, callFormData: '{"a":1}', dispatchUnits: ['7', '8'], dispatchUsers: ['u1'] });
    expect(request).not.toHaveProperty('protocolIds');
    expect(request).not.toHaveProperty('linkedCallId');
    // The call's text goes back as it stands: the sanitizer's entities decoded, the web's rich text as stored.
    const richNature = '<p><strong>Smoke</strong> &amp; flames</p>';
    const text = buildAddResourcesRequest(makeCall('5', { Name: 'Smith &amp; Sons', Nature: richNature, Note: 'Gate &lt;1234&gt;' }), current, { everyone: false, users: [], groups: [], roles: [], units: ['8'] });
    expect(text).toMatchObject({ name: 'Smith & Sons', nature: richNature, note: 'Gate <1234>' });
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
    // The schedule wins over the dispatch time where a newer server sends both (Dispatch).
    expect(isScheduledCall(makeCall('1', { ScheduledOnUtc: '2026-11-01T12:00:00', DispatchedOnUtc: '2026-10-30T12:00:00Z' }), now)).toBe(true);
  });

  it('knows a closed call under any close type', () => {
    expect([0, 1, 2, 7, 8].map((State) => isClosedCall(makeCall('1', { State })))).toEqual([false, true, true, true, false]);
  });
});

describe('call filters', () => {
  const calls = [makeCall('1', { Priority: 0, Name: 'Structure fire' }), makeCall('2', { Priority: 3, Name: 'Medical', Nature: '<b>chest</b> pain', Type: 'EMS' }), makeCall('3', { Name: 'REDACTED' })];
  it('searches plain text (tags stripped, protected values never match) and filters by priority and type', () => {
    expect(filterCalls(calls, { ...EMPTY_CALL_FILTERS, query: 'chest pain' }).map((call) => call.CallId)).toEqual(['2']);
    // Core's sanitizer writes `&amp;` into the name; the dispatcher searches for what they see.
    expect(filterCalls([makeCall('4', { Name: 'Smith &amp; Sons' })], { ...EMPTY_CALL_FILTERS, query: 'smith & sons' })).toHaveLength(1);
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
    const result = validateCallForm({ ...emptyCallFormValues(null), latitude: '91', longitude: '10' }, { policy, validPriorityIds: [0, 1] });
    expect(result.isValid).toBe(false);
    expect(result.errors).toMatchObject({ name: 'calls.validation.name_required', nature: 'calls.validation.nature_required', priority: 'calls.invalid_priority', latitude: 'calls.latitude_invalid' });
    expect(result.missingPolicyFields).toEqual(['address', 'dispatchList']);
  });

  it('requires custom fields marked required', () => {
    const fields = [{ UdfFieldId: 'f1', IsEnabled: true, IsRequired: true, IsReadOnly: false }] as never;
    const values = { ...emptyCallFormValues(1), name: 'A', nature: 'B', address: 'x', dispatch: { everyone: true, users: [], groups: [], roles: [], units: [] } };
    expect(validateCallForm(values, { policy, udfFields: fields, validPriorityIds: [1] }).missingUdfFields).toEqual(['f1']);
    expect(validateCallForm({ ...values, udfValues: [{ UdfFieldId: 'f1', Value: 'ok' }] }, { policy, udfFields: fields, validPriorityIds: [1] }).isValid).toBe(true);
  });

  it('leaves out properties the client has no picker for, and sends a pending call without a dispatch time', () => {
    const values = { ...emptyCallFormValues(2), name: 'Fire', nature: 'Smoke', latitude: '39.1', longitude: '-104.8', dispatchOnUtc: '2026-11-02T10:00:00.000Z', protocolIds: [3] };
    const quick = toCreateCallRequest(values, { protocols: false, linkedCall: false, udf: false, contact: false, dispatchList: false });
    expect(quick).not.toHaveProperty('protocolIds');
    expect(quick).not.toHaveProperty('linkedCallId');
    expect(quick).not.toHaveProperty('udfValues');
    expect(quick).toMatchObject({ latitude: 39.1, longitude: -104.8, dispatchOnUtc: '2026-11-02T10:00:00.000Z' });
    const full = toCreateCallRequest({ ...values, isPending: true }, { protocols: true, linkedCall: true, udf: true, contact: true, dispatchList: true });
    expect(full).toMatchObject({ protocolIds: [3], linkedCallId: '', udfValues: [], isPending: true });
    expect(full).not.toHaveProperty('dispatchOnUtc');
  });

  it('dispatches nobody when the dispatch list is shown and no one is picked (create and edit), never everyone', () => {
    const values = { ...emptyCallFormValues(1), name: 'Fire', nature: 'Smoke' };
    const shown = { protocols: false, linkedCall: false, udf: false, contact: false, dispatchList: true };
    expect(buildNewCallInput(toCreateCallRequest(values, shown)).DispatchList).toBe(DISPATCH_LIST_NOBODY);
    expect(buildNewCallInput(toCreateCallRequest({ ...values, dispatch: { ...values.dispatch, everyone: true } }, shown)).DispatchList).toBe('0');
    // A pending call is never saved for everyone; the form keeps the pick for when Pending is turned off.
    expect(buildNewCallInput(toCreateCallRequest({ ...values, isPending: true, dispatch: { ...values.dispatch, everyone: true } }, shown)).DispatchList).toBe(DISPATCH_LIST_NOBODY);
    const edit = { call: makeCall('9'), storedProtocolCount: 0, initialDispatchOnUtc: '' };
    expect(buildEditCallInput(toUpdateCallRequest('9', values, shown, { edit, isVisible: () => true })).DispatchList).toBe(DISPATCH_LIST_NOBODY);
    // With the list hidden the request is not marked as picked: blank, which EditCall reads as "keep the dispatches".
    expect(buildEditCallInput(toUpdateCallRequest('9', values, { ...shown, dispatchList: false }, { edit, isVisible: () => false })).DispatchList).toBe('');
  });

  it('starts an edit from the call and leaves fields the policy hides as stored (Dispatch keepHiddenEditFieldsUnchanged)', () => {
    // SAFETY: the form reads only the protocol count from Protocols; a partial entry stands in for the server's record.
    const call = makeCall('9', { ContactName: 'Hidden Contact', ExternalId: 'EXT-1', Latitude: '39.5', Longitude: '-105.1', DestinationPoiId: 12, Protocols: [{ Id: 4 }] as never });
    const values = callToFormValues(call, [dispatch({ Id: 'u1', Type: 'User' }), dispatch({ Id: '4', Type: 'U' })], { types: [{ Id: 'x', Name: 'Fire' }] });
    expect(values).toMatchObject({ contactName: 'Hidden Contact', externalId: 'EXT-1', latitude: '39.5', longitude: '-105.1', type: 'Fire', protocolIds: [], dispatch: { users: ['u1'], units: ['4'] } });
    const hidden = createFieldPolicy([rule('contactName', false, false), rule('destinationPoi', false, false), rule('protocols', false, false), rule('geolocation', false, false)]);
    const edit = { call, storedProtocolCount: 1, initialDispatchOnUtc: '' };

    const request = toUpdateCallRequest(
      '9',
      { ...values, destinationPoiId: null, notifyCancelledEntities: true },
      { protocols: true, linkedCall: true, udf: false, contact: false, dispatchList: false },
      { edit, isVisible: hidden.isVisible }
    );

    // Blank text = keep the stored value; the destination goes up as stored; protocols are left out; no point is posted.
    expect(request).toMatchObject({ callId: '9', contactName: '', externalId: 'EXT-1', destinationPoiId: 12, linkedCallId: '', notifyCancelledEntities: true, rebroadcastCall: false });
    expect(request).not.toHaveProperty('dispatchOnUtc');
    expect(request.protocolIds).toBeUndefined();
    expect(request.latitude).toBeUndefined();
  });

  it('sends an edit only the protocols it adds, a newly picked dispatch time and a changed contact', () => {
    const now = Date.parse('2026-11-03T10:00:00Z');
    // SAFETY: the edit reads only ContactId from the call's contacts; a partial entry stands in for the server's record.
    const call = makeCall('9', { DispatchedOnUtc: '2026-11-03T12:00:00', Contacts: [{ ContactId: 'c1' }] as never });
    const values = callToFormValues(call, [], { now });
    expect(values.dispatchOnUtc).toBe('2026-11-03T12:00:00.000Z');
    const policy = createFieldPolicy(null);
    const edit = { call, storedProtocolCount: 0, initialDispatchOnUtc: values.dispatchOnUtc };
    const pickers = { protocols: true, linkedCall: false, udf: false, contact: true, dispatchList: false };
    const unchanged = toUpdateCallRequest('9', { ...values, protocolIds: [7] }, pickers, { edit, isVisible: policy.isVisible });
    expect(unchanged).toMatchObject({ protocolIds: [7] });
    expect(unchanged).not.toHaveProperty('dispatchOnUtc');
    expect(unchanged).not.toHaveProperty('contactId');
    const moved = toUpdateCallRequest('9', { ...values, dispatchOnUtc: '2026-11-03T14:00:00.000Z', contactId: 'c2' }, pickers, { edit, isVisible: policy.isVisible });
    expect(moved).toMatchObject({ dispatchOnUtc: '2026-11-03T14:00:00.000Z', contactId: 'c2' });
    // A call already out has nothing to reschedule.
    expect(callToFormValues(makeCall('9', { DispatchedOnUtc: '2026-11-03T08:00:00Z' }), [], { now }).dispatchOnUtc).toBe('');
  });

  it('edits a nature and note the web wrote as rich text as plain text, and keeps their formatting unless the text changed', () => {
    const nature = '<p>JUST A TEST!</p><p><strong>Smoke</strong> &amp; flames<br>2nd floor</p>';
    const note = '<ul><li>Gate code 1234</li></ul>';
    const call = makeCall('9', { Name: 'Smith &amp; Sons', Nature: nature, Note: note });
    const values = callToFormValues(call);
    expect(values).toMatchObject({ name: 'Smith & Sons', nature: 'JUST A TEST!\nSmoke & flames\n2nd floor', note: '• Gate code 1234' });
    const policy = createFieldPolicy(null);
    const edit = { call, storedProtocolCount: 0, initialDispatchOnUtc: '' };
    const pickers = { protocols: false, linkedCall: false, udf: false, contact: false, dispatchList: false };
    // Left as loaded: the call keeps its rich text; the name goes back as text, not as the sanitizer's entity.
    expect(toUpdateCallRequest('9', values, pickers, { edit, isVisible: policy.isVisible })).toMatchObject({ name: 'Smith & Sons', nature, note });
    // Changed: the edited text as paragraphs, so its line breaks still show.
    expect(toUpdateCallRequest('9', { ...values, nature: 'Smoke & flames\n3rd floor' }, pickers, { edit, isVisible: policy.isVisible })).toMatchObject({ nature: '<p>Smoke &amp; flames</p><p>3rd floor</p>', note });
    // A call stored as plain text stays plain text.
    const plain = makeCall('9', { Nature: 'Odor of gas &amp; smoke', Note: 'Rear door' });
    const plainValues = callToFormValues(plain);
    expect(plainValues).toMatchObject({ nature: 'Odor of gas & smoke', note: 'Rear door' });
    expect(toUpdateCallRequest('9', plainValues, pickers, { edit: { ...edit, call: plain }, isVisible: policy.isVisible })).toMatchObject({ nature: 'Odor of gas & smoke', note: 'Rear door' });
  });

  it('applies a call template, its rich-text nature as plain text', () => {
    const values = { ...emptyCallFormValues(1), name: 'Typed', nature: 'Typed nature', type: 'Fire' };

    const template = {
      Id: 't1',
      IsDisabled: false,
      Name: 'Alarm',
      CallName: 'Fire Alarm',
      CallNature: '<p>Commercial <strong>fire alarm</strong></p><p>Check panel</p>',
      CallType: '',
      CallPriority: 9,
      CreatedByUserId: '',
      CreatedOn: '',
    };

    expect(applyCallTemplate(values, template, [1, 2])).toMatchObject({ name: 'Fire Alarm', nature: 'Commercial fire alarm\nCheck panel', type: 'Fire', priority: 1 });
    expect(applyCallTemplate(values, { ...template, CallName: '', CallNature: '', CallPriority: 2 }, [1, 2])).toMatchObject({ name: 'Typed', nature: 'Typed nature', priority: 2 });
  });

  it('applies the edit rules for required fields (Dispatch getEditCallMissingFields)', () => {
    const policy = createFieldPolicy([
      rule('note', true, true),
      rule('dispatchOn', true, true),
      rule('linkedCall', true, true),
      rule('protocols', true, true),
      rule('dispatchList', true, true),
      rule('indoorLocation', true, true),
    ]);

    const call = makeCall('9', { Note: 'Stored note' });
    const base = { ...emptyCallFormValues(1), name: 'A', nature: 'B', type: 'Fire' };
    // A blank note keeps the stored one; the dispatch time and linked call are never required on an edit; protocols are not
    // judged when the attached ones could not be read; indoor location is never enforced.
    expect(missingPolicyFields(base, policy, { call, storedProtocolCount: null, initialDispatchOnUtc: '' })).toEqual(['dispatchList']);
    expect(missingPolicyFields(base, policy, { call, storedProtocolCount: 0, initialDispatchOnUtc: '' })).toEqual(['protocols', 'dispatchList']);
    // A pending call's recipients are decided when it is dispatched.
    expect(missingPolicyFields(base, policy, { call: makeCall('9', { Note: 'n', State: 8 }), storedProtocolCount: 2, initialDispatchOnUtc: '' })).toEqual([]);
  });

  it('applies the create rules: a pending call needs no dispatch list or time, indoor location is never enforced', () => {
    const policy = createFieldPolicy([rule('dispatchOn', true, true), rule('dispatchList', true, true), rule('indoorLocation', true, true)]);
    const base = { ...emptyCallFormValues(1), name: 'A', nature: 'B' };
    expect(missingPolicyFields(base, policy)).toEqual(['dispatchOn', 'dispatchList']);
    expect(missingPolicyFields({ ...base, isPending: true }, policy)).toEqual([]);
  });

  it('requires a type when the department has types, and a scheduled dispatch at least 15 minutes ahead', () => {
    const now = Date.parse('2026-11-03T10:00:00Z');
    const base = { ...emptyCallFormValues(1), name: 'A', nature: 'B' };
    const policy = createFieldPolicy(null);
    expect(validateCallForm(base, { policy, validPriorityIds: [1], validTypeNames: ['Fire'], now }).errors.type).toBe('calls.validation.type_required');
    expect(validateCallForm({ ...base, type: 'Gone' }, { policy, validPriorityIds: [1], validTypeNames: ['Fire'], now }).errors.type).toBe('calls.invalid_type');
    expect(validateCallForm(base, { policy, validPriorityIds: [1], validTypeNames: [], now }).isValid).toBe(true);
    const soon = validateCallForm({ ...base, dispatchOnUtc: '2026-11-03T10:05:00Z' }, { policy, validPriorityIds: [1], now });
    expect(soon).toMatchObject({ isValid: false, dispatchTooSoon: true, errors: { dispatchOnUtc: 'calls.dispatch_on_too_soon' } });
    expect(validateCallForm({ ...base, dispatchOnUtc: '2026-11-03T10:05:00Z', isPending: true }, { policy, validPriorityIds: [1], now }).isValid).toBe(true);
    expect(isDispatchTimeTooSoon('2026-11-03T10:20:00Z', now)).toBe(false);
    // An edit checks only a time it changes.
    const call = makeCall('9');
    expect(
      validateCallForm({ ...base, dispatchOnUtc: '2026-11-03T10:05:00.000Z' }, { policy, validPriorityIds: [1], now, edit: { call, storedProtocolCount: 0, initialDispatchOnUtc: '2026-11-03T10:05:00.000Z' } }).isValid
    ).toBe(true);
    expect(getScheduledDispatchPrefill('2026-11-03T09:00:00', now)).toBe('');
  });

  it('shows custom fields that are on mobile or required (Dispatch isUdfFieldShown)', () => {
    expect(isUdfFieldShown({ IsEnabled: true, IsVisibleOnMobile: false, IsRequired: true })).toBe(true);
    expect(isUdfFieldShown({ IsEnabled: true, IsVisibleOnMobile: false, IsRequired: false })).toBe(false);
    expect(isUdfFieldShown({ IsEnabled: false, IsVisibleOnMobile: true, IsRequired: true })).toBe(false);
  });

  it('reads the fields a save was refused for and names them the way the form does', () => {
    const refusal = new ApiError({ kind: 'http', status: 400, data: '"Required call fields are missing: address, contactInfo, somethingNew"' });
    const keys = getMissingCallFieldsFromRefusal(refusal);
    expect(keys).toEqual(['address', 'contactInfo', 'somethingNew']);
    expect(describeCallFields(keys ?? [], (key) => `t:${key}`)).toBe('t:calls.address, t:calls.contact_info, somethingNew');
    expect(getMissingCallFieldsFromRefusal(new ApiError({ kind: 'http', status: 400, data: { Message: 'Other problem' } }))).toBeNull();
    expect(getMissingCallFieldsFromRefusal(new ApiError({ kind: 'http', status: 500, data: 'Required call fields are missing: address' }))).toBeNull();
  });

  it('round-trips a refused request into the correction form', () => {
    const request = toCreateCallRequest(
      { ...emptyCallFormValues(1), name: 'A', nature: 'B', dispatch: { everyone: false, users: ['u1'], groups: [], roles: [], units: [] } },
      { protocols: false, linkedCall: false, udf: false, contact: false, dispatchList: false }
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

  it('reads latitude and longitude as decimal degrees in range', () => {
    expect(parseLatitude(' -39.5 ')).toEqual({ ok: true, value: -39.5 });
    expect(parseLatitude('90')).toEqual({ ok: true, value: 90 });
    expect(parseLatitude('90.1')).toEqual({ ok: false, reason: 'out_of_range' });
    expect(parseLongitude('-180')).toEqual({ ok: true, value: -180 });
    expect(parseLongitude('180.5')).toEqual({ ok: false, reason: 'out_of_range' });

    for (const text of ['39,5', '39.5N', '1e2', '--3', '39 30', 'abc']) expect(parseLatitude(text)).toEqual({ ok: false, reason: 'invalid_format' });
    expect(parseCoordinateFields('39.1', '-104.8')).toEqual({ ok: true, latitude: 39.1, longitude: -104.8 });
    expect(parseCoordinateFields('', ' ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseCoordinateFields('39.1', '')).toEqual({ ok: false, reason: 'invalid_format' });
    expect(parseCoordinateFields('39.1', '200')).toEqual({ ok: false, reason: 'out_of_range' });
  });

  it('flags each coordinate field: out of range or not a number, and one without the other', () => {
    expect(coordinateFieldErrors('', '')).toEqual({});
    expect(coordinateFieldErrors('39.1', '-104.8')).toEqual({});
    expect(coordinateFieldErrors('95', 'west')).toEqual({ latitude: 'calls.latitude_invalid', longitude: 'calls.longitude_invalid' });
    expect(coordinateFieldErrors('39.1', '')).toEqual({ longitude: 'calls.coordinates_incomplete' });
    expect(coordinateFieldErrors('', '-104.8')).toEqual({ latitude: 'calls.coordinates_incomplete' });
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
    // A timeout or rate limit is not a refusal: sending again can work (Dispatch isCallCloseRejection).
    expect(getCallCloseErrorMessage(new ApiError({ kind: 'http', status: 408, data: 'Request Timeout' }))).toBeNull();
    expect(getCallCloseErrorMessage(new ApiError({ kind: 'http', status: 429, data: 'Too many requests' }))).toBeNull();
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

describe('what3words addresses', () => {
  it('accepts three dot-joined words in any language and nothing else', () => {
    for (const words of ['filled.count.soap', ' Filled.Count.Soap ', 'größte.straße.baum', 'игра.дом.окно', 'λέξη.λέξη.λέξη', 'مكتب.باب.شمس']) expect(isWhat3WordsFormat(words)).toBe(true);

    for (const words of ['filled.count', 'filled..soap', 'filled.count.soap.extra', 'fil led.count.soap', '12.34.56', 'a_b.c.d', '']) expect(isWhat3WordsFormat(words)).toBe(false);
  });
});
