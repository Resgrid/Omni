import './test-setup';

import { ActionBaseTypes } from '@resgrid/features/status';
import type { CallResultData } from '@resgrid/models';

import { callDestinationTarget, callLocationTarget, isUsablePoint } from '../lib/call-location';
import { consoleMetrics } from '../lib/console-layout';
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
    expect(visibleQuickActions({ ...none, chat: true, inventory: true }).map((action) => action.id)).toEqual(['chat', 'assistant', 'inventory', 'settings']);
    expect(visibleQuickActions({ ...none, chat: true }, ['assistant']).map((action) => action.id)).toEqual(['chat', 'settings']);
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
