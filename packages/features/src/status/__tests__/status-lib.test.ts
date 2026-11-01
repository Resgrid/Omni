import { type CallResultData } from '@resgrid/models';

import { ActionBaseTypes, isStaffingOnDuty, isStatusAvailable, isStatusResponding, StaffingBaseTypes, statusAvailability } from '../lib/base-types';
import { readableColors } from '../lib/readable-colors';
import { getCurrentStatusCallId, getDestinationTabs, resolveDefaultStatusCall, resolveEffectiveDestination } from '../lib/status-destination';
import { canSubmitStatusWithoutInput, getOfferedStatuses, resolveCurrentStatusId } from '../lib/status-flow';
import { getUnitStatusOptions } from '../lib/unit-status-set';

const call = (CallId: string): CallResultData => ({ CallId, Name: `Call ${CallId}` }) as CallResultData;

describe('base types', () => {
  it('classifies department statuses by meaning', () => {
    expect(statusAvailability(ActionBaseTypes.InQuarters)).toBe('available');
    expect(statusAvailability(ActionBaseTypes.Transporting)).toBe('committed');
    expect(statusAvailability(-1)).toBe('unknown');
    expect(statusAvailability(undefined)).toBe('unknown');
    expect(isStatusAvailable(ActionBaseTypes.OnBreak)).toBe(true);
    expect(isStatusResponding(ActionBaseTypes.Enroute)).toBe(true);
    expect(isStaffingOnDuty(StaffingBaseTypes.OffDuty)).toBe(false);
  });
});

describe('status flow', () => {
  const options = [
    { Id: 1, Text: 'Available', BaseType: 0, NextIds: [2, 3] },
    { Id: 2, Text: 'Responding', BaseType: 2 },
    { Id: 3, Text: 'On Scene', BaseType: 3 },
    { Id: 4, Text: 'Staging', BaseType: 9 },
  ];

  it('resolves the current option by id, then by a unique BaseType', () => {
    expect(resolveCurrentStatusId(options, { StateId: 3 })).toBe('3');
    expect(resolveCurrentStatusId(options, { StateId: 77, BaseType: 9 })).toBe('4');
    expect(resolveCurrentStatusId([...options, { Id: 5, Text: 'Staged 2', BaseType: 9 }], { StateId: 77, BaseType: 9 })).toBeNull();
    expect(resolveCurrentStatusId(options, { StateId: null, BaseType: -1 })).toBeNull();
  });

  it('restricts to next statuses and falls back to everything', () => {
    expect(getOfferedStatuses(options, '1', false)).toEqual(expect.objectContaining({ isRestricted: true, hiddenCount: 2 }));
    expect(getOfferedStatuses(options, '1', true).offered).toHaveLength(4);
    expect(
      getOfferedStatuses(
        [
          { Id: 1, Text: 'A', NextIds: [99] },
          { Id: 2, Text: 'B' },
        ],
        '1',
        false
      ).isRestricted
    ).toBe(false);
  });

  it('knows when a held status can save without input', () => {
    expect(canSubmitStatusWithoutInput({ Detail: 0, Note: 1 }, { allowsCalls: false, hasDefaultCall: false })).toBe(true);
    expect(canSubmitStatusWithoutInput({ Detail: 0, Note: 2 }, { allowsCalls: false, hasDefaultCall: false })).toBe(false);
    expect(canSubmitStatusWithoutInput({ Detail: 2, Note: 0 }, { allowsCalls: true, hasDefaultCall: true })).toBe(true);
    expect(canSubmitStatusWithoutInput({ Detail: 1, Note: 0 }, { allowsCalls: false, hasDefaultCall: true })).toBe(false);
  });
});

describe('status destinations', () => {
  it('maps Detail to tabs, strict or lenient', () => {
    expect(getDestinationTabs(2)).toEqual(['call']);
    expect(getDestinationTabs(2, true)).toEqual(['call', 'station', 'poi']);
    expect(getDestinationTabs(6)).toEqual(['station', 'poi']);
  });

  it('defaults to the active call, else the open call the current status points at', () => {
    const calls = [call('1'), call('2')];
    expect(resolveDefaultStatusCall(calls, '2', { DestinationId: 1, DestinationType: 2 })?.CallId).toBe('2');
    expect(resolveDefaultStatusCall(calls, '9', { DestinationId: 1, DestinationType: null })?.CallId).toBe('1');
    expect(resolveDefaultStatusCall(calls, null, { DestinationId: 1, DestinationType: 1 })).toBeNull();
    expect(getCurrentStatusCallId({ DestinationId: '0' })).toBeNull();
  });

  it('never re-applies the default after an explicit choice', () => {
    const defaultCall = call('1');
    expect(resolveEffectiveDestination({ detail: 2, lenient: false, selection: { type: 'none' }, hasExplicitChoice: false, defaultCall })).toEqual({ type: 'call', call: defaultCall });
    expect(resolveEffectiveDestination({ detail: 2, lenient: false, selection: { type: 'none' }, hasExplicitChoice: true, defaultCall })).toEqual({ type: 'none' });
  });
});

describe('unit status sets', () => {
  const sets = [
    { UnitType: '0', StatusId: '0', Statuses: ['built-in'] },
    { UnitType: 'Engine', StatusId: '5', Statuses: ['engine'] },
  ];

  it('matches the set id first, then the type name, else the built-in set', () => {
    expect(getUnitStatusOptions(sets, { Type: 'Renamed', CustomStatusSetId: '5' })).toEqual(['engine']);
    expect(getUnitStatusOptions(sets, { Type: 'Engine', CustomStatusSetId: '' })).toEqual(['engine']);
    expect(getUnitStatusOptions(sets, { Type: 'Ladder', CustomStatusSetId: '0' })).toEqual(['built-in']);
  });
});

describe('readable colours', () => {
  it('picks readable text and adds the missing #', () => {
    expect(readableColors('ffffff')).toEqual({ backgroundColor: '#ffffff', textColor: '#000000' });
    expect(readableColors('not-a-colour').backgroundColor).toBe('#808080');
  });
});
