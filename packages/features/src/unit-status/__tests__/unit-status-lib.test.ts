import './test-setup';

import { ActionBaseTypes } from '@resgrid/features/status';
import type { CallResultData } from '@resgrid/models';

import { callDestinationTarget, callLocationTarget, isUsablePoint } from '../lib/call-location';
import { consoleMetrics, fitRoundButtonSize, MIN_ROUND_BUTTON_SIZE, MIN_TOUCH_TARGET, roundButtonRow } from '../lib/console-layout';
import { visibleQuickActions } from '../lib/quick-actions';
import { resolveUnitStatusDisplay, statusStyleColor } from '../lib/status-display';
import { unitStatusRoutes } from '../routes';

const option = (Id: number, Text: string, BColor: string, BaseType?: number) => ({ Id, Text, BColor, BaseType });
const statuses = [option(1, 'In Quarters', '#00ff00', ActionBaseTypes.InQuarters), option(2, 'Responding', '#ff0000', ActionBaseTypes.Responding), option(3, 'On Scene', '#0000ff', ActionBaseTypes.OnScene)];

describe('statusStyleColor', () => {
  it('maps the legacy label classes, keeps hex colours and drops unknown values', () => {
    expect(statusStyleColor('label-danger')).toBe('#ED5565');
    expect(statusStyleColor('label-returning')).toBeNull();
    expect(statusStyleColor('ff8800')).toBe('#ff8800');
    expect(statusStyleColor('#123')).toBe('#123');
    expect(statusStyleColor('rgb(1,2,3)')).toBe('rgb(1,2,3)');
    expect(statusStyleColor('label-unknown')).toBeNull();
    expect(statusStyleColor('')).toBeNull();
    expect(statusStyleColor(null)).toBeNull();
  });
});

describe('resolveUnitStatusDisplay', () => {
  it('matches the current status by id and takes its colour and meaning', () => {
    const display = resolveUnitStatusDisplay({ statuses, currentStatus: { StateId: 2, State: 'Responding', StateStyle: 'label-danger', DestinationName: 'Call 42', TimestampUtc: '2026-11-01T10:00:00' } });
    expect(display).toMatchObject({ statusId: '2', text: 'Responding', color: '#ff0000', baseType: ActionBaseTypes.Responding, destinationName: 'Call 42', isPending: false });
  });

  it('falls back to the meaning (BaseType) — never the text — when the id is not in the set', () => {
    const display = resolveUnitStatusDisplay({
      statuses,
      unitInfo: { CurrentStatusId: '99', CurrentStatus: 'ON SCENE (renamed)', CurrentStatusColor: '', CurrentStatusBaseType: ActionBaseTypes.OnScene, CurrentDestinationName: '', CurrentStatusTimestampUtc: '' },
    });
    expect(display.statusId).toBe('3');
    expect(display.text).toBe('ON SCENE (renamed)');
    expect(display.color).toBe('#0000ff');
  });

  it('uses the roster colour, then the StateStyle class, when no option matches', () => {
    expect(
      resolveUnitStatusDisplay({
        statuses: [],
        unitInfo: { CurrentStatusId: '', CurrentStatus: 'Avail', CurrentStatusColor: '#abcdef', CurrentStatusBaseType: null, CurrentDestinationName: '', CurrentStatusTimestampUtc: '' },
      }).color
    ).toBe('#abcdef');
    expect(resolveUnitStatusDisplay({ statuses: [], currentStatus: { StateId: undefined, State: 'Out', StateStyle: 'label-default', DestinationName: '', TimestampUtc: '' } }).color).toBe('#262626');
  });

  it('marks a queued newer status as pending with its name', () => {
    const display = resolveUnitStatusDisplay({ statuses, currentStatus: { StateId: 1, State: 'In Quarters', StateStyle: '', DestinationName: '', TimestampUtc: '' }, pending: { statusType: '3' } });
    expect(display.isPending).toBe(true);
    expect(display.pendingText).toBe('On Scene');
    expect(display.statusId).toBe('1');
  });
});

describe('call location targets', () => {
  const call = (overrides: Partial<CallResultData>): CallResultData =>
    ({
      Name: 'Fire',
      Address: '1 Main St',
      Latitude: '',
      Longitude: '',
      Geolocation: '',
      DestinationLatitude: null,
      DestinationLongitude: null,
      DestinationAddress: '',
      DestinationName: '',
      ...overrides,
    }) as CallResultData;

  it('prefers coordinates, skips the (0,0) sentinel and falls back to the address', () => {
    expect(isUsablePoint('0', '0')).toBe(false);
    expect(isUsablePoint('39.5', '-119.8')).toBe(true);
    expect(callLocationTarget(call({ Latitude: '39.5', Longitude: '-119.8' }))).toEqual({ latitude: 39.5, longitude: -119.8, label: 'Fire' });
    expect(callLocationTarget(call({ Latitude: '0', Longitude: '0' }))).toEqual({ address: '1 Main St', label: 'Fire' });
    expect(callLocationTarget(call({ Geolocation: '40.1,-120.2' }))).toEqual({ latitude: 40.1, longitude: -120.2, label: 'Fire' });
    expect(callLocationTarget(call({ Address: '' }))).toBeNull();
  });

  it('never puts a withheld (protected) address or name into a navigation target', () => {
    expect(callLocationTarget(call({ Address: 'REDACTED', Name: 'REDACTED', RedactedFields: ['calls.address', 'calls.name'] }))).toBeNull();
    expect(callLocationTarget(call({ Latitude: '39.5', Longitude: '-119.8', Name: 'REDACTED', RedactedFields: ['calls.name'] }))).toEqual({ latitude: 39.5, longitude: -119.8, label: undefined });
  });

  it('builds the destination POI target from coordinates, else its address', () => {
    expect(callDestinationTarget(call({ DestinationLatitude: 39.2, DestinationLongitude: -119.1, DestinationName: 'Hospital' }))).toEqual({ latitude: 39.2, longitude: -119.1, label: 'Hospital' });
    expect(callDestinationTarget(call({ DestinationLatitude: 0, DestinationLongitude: 0, DestinationAddress: '5 Care Way' }))).toEqual({ address: '5 Care Way', label: '5 Care Way' });
    expect(callDestinationTarget(call({}))).toBeNull();
  });
});

describe('quick actions', () => {
  const none = { chat: false, checklists: false, deployments: false, records: false, inventory: false };

  it('shows only settings when every gate is off', () => {
    expect(visibleQuickActions(none).map((action) => action.id)).toEqual(['settings']);
  });

  it('follows flags and the active unit, and drops actions the variant lacks', () => {
    expect(visibleQuickActions({ ...none, chat: true, inventory: true }).map((action) => action.id)).toEqual(['chat', 'inventory', 'settings']);
    expect(visibleQuickActions({ ...none, chat: true, checklists: true, deployments: true }, ['settings']).map((action) => action.id)).toEqual(['chat', 'checklists', 'operations']);
  });

  // The assistant lives in the chat list (pinned first), so it has no shortcut of its own.
  it('has no assistant shortcut', () => {
    expect(visibleQuickActions({ chat: true, checklists: true, deployments: true, records: true, inventory: true }).map((action) => action.href)).not.toContain('/chatbot');
  });
});

describe('fitRoundButtonSize', () => {
  it('keeps the preferred size when the row fits it or is not measured yet', () => {
    expect(fitRoundButtonSize(36, 0, 3, 3)).toBe(36);
    expect(fitRoundButtonSize(36, 200, 3, 3)).toBe(36);
  });

  // The sidebar's half-width unit card: three 36 pt buttons and their margins need 126 pt.
  it('shrinks the buttons so they share one row instead of wrapping', () => {
    const size = fitRoundButtonSize(36, 120, 3, 3);
    expect(size).toBe(34);
    expect(3 * (size + 6)).toBeLessThanOrEqual(120);
  });

  it('never shrinks them below the minimum', () => {
    expect(fitRoundButtonSize(36, 60, 3, 3)).toBe(MIN_ROUND_BUTTON_SIZE);
  });
});

describe('roundButtonRow', () => {
  // The sidebar's 36 pt buttons in 44 pt slots (4 pt either side): full 44 pt targets, none reaching into the next.
  it('gives the preferred size full, separate 44 pt targets', () => {
    const row = roundButtonRow(36, 200, 3, 4);

    expect(row).toEqual({ size: 36, wraps: false, hitSlop: { top: 4, bottom: 4, left: 4, right: 4 } });
    expect(row.size + 4 + 4).toBe(MIN_TOUCH_TARGET);
  });

  // 44 pt of slop on shrunk buttons overlapped their neighbours, so a touch at one's edge could press the next.
  it('keeps a shrunk button 44 pt tall to the finger but its target inside its own slot', () => {
    const row = roundButtonRow(36, 100, 3, 4);

    expect(row).toEqual({ size: 25, wraps: false, hitSlop: { top: 10, bottom: 10, left: 4, right: 4 } });
    expect(row.size + 10 + 10).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(row.size + 4 + 4).toBeLessThanOrEqual(Math.floor(100 / 3));
  });

  // Three 24 pt buttons in their slots need 96 pt: an 80 pt row wraps rather than running out of the card.
  it('wraps a row too narrow for the smallest buttons, and keeps their targets apart up and down too', () => {
    expect(roundButtonRow(36, 80, 3, 4)).toEqual({ size: MIN_ROUND_BUTTON_SIZE, wraps: true, hitSlop: { top: 4, bottom: 4, left: 4, right: 4 } });
  });

  it('adds no slop to a button already a full target, and never wraps a row not measured yet', () => {
    expect(roundButtonRow(48, 0, 3, 4)).toEqual({ size: 48, wraps: false, hitSlop: undefined });
  });
});

describe('consoleMetrics', () => {
  it('grows the touch targets and splits the console on an MDT', () => {
    expect(consoleMetrics({ isElectron: true, isDesktop: false, isLandscapeBoard: false, isWall: false })).toMatchObject({ density: 'mdt', buttonMinHeight: 64, statusColumns: 3, twoColumn: true });
    expect(consoleMetrics({ isElectron: false, isDesktop: false, isLandscapeBoard: true, isWall: false })).toMatchObject({ density: 'standard', buttonMinHeight: 48, statusColumns: 2, twoColumn: true });
    expect(consoleMetrics({ isElectron: false, isDesktop: false, isLandscapeBoard: false, isWall: false })).toMatchObject({ statusColumns: 1, twoColumn: false });
  });
});

describe('routes', () => {
  it('builds the console href', () => {
    expect(unitStatusRoutes.console()).toBe('/console');
  });
});
