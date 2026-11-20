import './test-setup';

import { RouteInstanceStatus } from '@resgrid/data';
import type { CallRouteInstanceResultData } from '@resgrid/models';

import { callDestinationTarget, callFreeDestination, callHasDestination } from '../lib/call-location';
import { callHasRoute, callRouteInstanceForUnit, callRouteInstancesOf, callRouteName, callRoutePlanId, isCallRouteRunning } from '../lib/call-route';

// Core M0322: a call's destination is a POI or a free location (address / point / what3words), and a call may run a route.
const noDestination = {
  DestinationPoiId: null,
  DestinationName: '',
  DestinationAddress: '',
  DestinationLatitude: null,
  DestinationLongitude: null,
};

describe('call destination (POI or free location)', () => {
  it('a POI destination: has one, is not free, and Directions goes to the POI', () => {
    const call = { ...noDestination, DestinationPoiId: 7, DestinationName: 'General Hospital', DestinationAddress: '1 Health Way', DestinationLatitude: 39.5, DestinationLongitude: -119.8 };
    expect(callHasDestination(call)).toBe(true);
    expect(callFreeDestination(call)).toBeNull();
    expect(callDestinationTarget(call)).toEqual({ latitude: 39.5, longitude: -119.8, label: 'General Hospital' });
  });

  it('a free destination Core filled into the destination point and address (no POI, no name)', () => {
    const call = { ...noDestination, DestinationAddress: '12 Main St', DestinationLatitude: 39.6, DestinationLongitude: -119.7, DestinationGeolocation: '39.6,-119.7', DestinationWhat3Words: 'filled.count.soap' };
    expect(callHasDestination(call)).toBe(true);
    expect(callDestinationTarget(call)).toEqual({ latitude: 39.6, longitude: -119.7, label: '12 Main St' });
    expect(callFreeDestination(call)).toEqual({ point: { latitude: 39.6, longitude: -119.7 }, address: '12 Main St', what3words: 'filled.count.soap', label: '12 Main St' });
  });

  it('a free destination read from DestinationGeolocation when the point fields are empty', () => {
    const call = { ...noDestination, DestinationGeolocation: '39.61234567,-119.7' };
    expect(callDestinationTarget(call)).toEqual({ latitude: 39.61234567, longitude: -119.7, label: undefined });
    expect(callFreeDestination(call)?.label).toBe('39.61235, -119.7');
  });

  it('a free destination with only an address or only what3words', () => {
    expect(callDestinationTarget({ ...noDestination, DestinationAddress: ' 5 Oak Ave ' })).toEqual({ address: '5 Oak Ave', label: '5 Oak Ave' });
    expect(callFreeDestination({ ...noDestination, DestinationWhat3Words: 'a.b.c' })).toEqual({ point: null, address: '', what3words: 'a.b.c', label: '///a.b.c' });
    expect(callHasDestination({ ...noDestination, DestinationWhat3Words: 'a.b.c' })).toBe(false);
  });

  it('no destination: (0,0) and blank values are not a place', () => {
    const call = { ...noDestination, DestinationLatitude: 0, DestinationLongitude: 0, DestinationGeolocation: '', DestinationAddress: '  ' };
    expect(callHasDestination(call)).toBe(false);
    expect(callDestinationTarget(call)).toBeNull();
    expect(callFreeDestination(call)).toBeNull();
  });
});

const run = (RouteInstanceId: string, UnitId: number, Status: number): CallRouteInstanceResultData => ({
  RouteInstanceId,
  RoutePlanId: 'rp-1',
  RoutePlanName: 'Transfer run',
  UnitId,
  UnitName: `Unit ${UnitId}`,
  Status,
  StopsCompleted: 0,
  StopsTotal: 2,
  ActualStartOn: '2026-11-19T10:00:00Z',
  ActualEndOn: null,
  StartReachedOn: null,
});

describe('call route', () => {
  it('reads the route id and name (the server name, else the call route plans list)', () => {
    expect(callRoutePlanId({ RoutePlanId: ' rp-1 ' })).toBe('rp-1');
    expect(callHasRoute({ RoutePlanId: '' })).toBe(false);
    expect(callHasRoute({})).toBe(false);
    expect(callRouteName({ RoutePlanId: 'rp-1', RoutePlanName: 'North transfer' })).toBe('North transfer');
    expect(callRouteName({ RoutePlanId: 'rp-1', RoutePlanName: null }, [{ RoutePlanId: 'rp-1', Name: 'From the list' }])).toBe('From the list');
    expect(callRouteName({ RoutePlanId: null, RoutePlanName: 'Stale' })).toBe('');
  });

  it('finds a unit’s run of the call’s route, the running one first', () => {
    const extraData = { RouteInstances: [run('ri-1', 10, RouteInstanceStatus.Completed), run('ri-2', 10, RouteInstanceStatus.Paused), run('ri-3', 11, RouteInstanceStatus.InProgress)] };
    expect(callRouteInstancesOf(extraData)).toHaveLength(3);
    expect(callRouteInstancesOf({})).toEqual([]);
    expect(callRouteInstanceForUnit(extraData, '10')?.RouteInstanceId).toBe('ri-2');
    expect(callRouteInstanceForUnit(extraData, 11)?.RouteInstanceId).toBe('ri-3');
    expect(callRouteInstanceForUnit({ RouteInstances: [run('ri-1', 10, RouteInstanceStatus.Completed)] }, 10)?.RouteInstanceId).toBe('ri-1');
    expect(callRouteInstanceForUnit(extraData, 12)).toBeNull();
    expect(callRouteInstanceForUnit(extraData, null)).toBeNull();
    expect(isCallRouteRunning(run('x', 1, RouteInstanceStatus.Cancelled))).toBe(false);
  });
});
