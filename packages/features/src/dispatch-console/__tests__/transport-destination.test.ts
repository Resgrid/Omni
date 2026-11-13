import '../../calls/__tests__/test-setup';

import { type CallResultData, type UnitInfoResultData } from '@resgrid/models';

import { indexCallsById, unitTransportDestinationMismatch } from '../lib/transport-destination';

/** Console unit rows flag a transport status headed somewhere other than the call's assigned destination. */
// SAFETY: test fixtures fill only the call fields unitTransportDestinationMismatch reads.
const calls = indexCallsById([
  { CallId: '40', DestinationPoiId: 900, DestinationName: 'AZ Sint-Elisabeth Zottegem', DestinationAddress: 'Godveerdegemstraat 69' },
  { CallId: '41', DestinationPoiId: null, DestinationName: '', DestinationAddress: '' },
  { CallId: '42', DestinationPoiId: 900, DestinationName: '', DestinationAddress: 'Godveerdegemstraat 69' },
] as CallResultData[]);

const unit = (extra: Partial<UnitInfoResultData>): UnitInfoResultData =>
  // SAFETY: test fixture fills only the unit fields unitTransportDestinationMismatch reads.
  ({ UnitId: '5', CurrentDestinationId: '901', CurrentDestinationType: 3, CurrentStatusBaseType: 12, ActiveCallId: '40', ...extra }) as UnitInfoResultData;

describe('unitTransportDestinationMismatch', () => {
  it("names the call's destination when a transport status goes to another POI", () => {
    expect(unitTransportDestinationMismatch(unit({}), calls)).toBe('AZ Sint-Elisabeth Zottegem');
    expect(unitTransportDestinationMismatch(unit({ CurrentStatusBaseType: 15 }), calls)).toBe('AZ Sint-Elisabeth Zottegem');
    expect(unitTransportDestinationMismatch(unit({ ActiveCallId: '42' }), calls)).toBe('Godveerdegemstraat 69');
  });

  it('stays quiet when there is nothing to flag', () => {
    expect(unitTransportDestinationMismatch(unit({ CurrentDestinationId: '900' }), calls)).toBeNull();
    expect(unitTransportDestinationMismatch(unit({ CurrentStatusBaseType: 3 }), calls)).toBeNull();
    expect(unitTransportDestinationMismatch(unit({ CurrentStatusBaseType: null }), calls)).toBeNull();
    expect(unitTransportDestinationMismatch(unit({ CurrentDestinationType: 2, CurrentDestinationId: '40' }), calls)).toBeNull();
    expect(unitTransportDestinationMismatch(unit({ ActiveCallId: '41' }), calls)).toBeNull();
    expect(unitTransportDestinationMismatch(unit({ ActiveCallId: null }), calls)).toBeNull();
    expect(unitTransportDestinationMismatch(unit({ ActiveCallId: '77' }), calls)).toBeNull();
    expect(unitTransportDestinationMismatch(unit({ CurrentDestinationId: '' }), calls)).toBeNull();
  });
});
