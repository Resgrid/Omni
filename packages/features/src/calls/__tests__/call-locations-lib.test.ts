import './test-setup';

import { buildEditCallInput, buildNewCallInput, type CreateCallRequest } from '@resgrid/api';
import { type CallRoutePlanResultData, type NewCallFieldKey, NewCallFieldKeys } from '@resgrid/models';

import {
  applyLocationPoi,
  applyRoutePlan,
  type CallFormPickers,
  type CallFormValues,
  callToFormValues,
  createRequestToFormValues,
  effectiveLocationPoi,
  emptyCallFormValues,
  hasFormDestination,
  toCreateCallRequest,
  toUpdateCallRequest,
  validateCallForm,
  withDestinationKind,
  withDestinationPoi,
} from '../lib/call-form';
import { callDestinationText } from '../lib/call-location';
import { callRoutePlanEndpoints, callRoutePlanSummary, filterCallRoutePlans, routeEndpointText } from '../lib/call-route';
import { createFieldPolicy } from '../lib/field-policy';
import { makeCall } from './test-utils';

// Core M0322: a call's location can come from a POI, its destination is a POI or a free location, and it may run a route.
const t: Parameters<typeof callRoutePlanSummary>[1] = (key, options) => (options ? `${key}:${Object.values(options).join(',')}` : key);

const PICKERS: CallFormPickers = { protocols: false, linkedCall: false, udf: false, contact: false, dispatchList: false, locationPoi: true, freeDestination: true, route: true };

const POI = { PoiId: 12, Name: 'Station 4', Address: '4 Engine Rd', Latitude: 39.5, Longitude: -119.8 };

const plan = (overrides: Partial<CallRoutePlanResultData> = {}): CallRoutePlanResultData => ({
  RoutePlanId: 'rp-1',
  Name: 'Hydrant loop',
  Description: null,
  RouteColor: '#ff0000',
  UnitId: null,
  StopsCount: 5,
  EstimatedDistanceMeters: 12400,
  EstimatedDurationSeconds: 1500,
  RoutingProfile: 0,
  Start: { Latitude: 39.1, Longitude: -119.1, DepartmentGroupId: 3, Name: 'Station 1' },
  End: { Latitude: 39.2, Longitude: -119.2, DepartmentGroupId: null, Name: 'General Hospital' },
  StartIsStop: false,
  EndIsStop: false,
  ...overrides,
});

const basics = (overrides: Partial<CallFormValues> = {}): CallFormValues => ({ ...emptyCallFormValues(1), name: 'Transfer', nature: 'Patient transfer', ...overrides });

describe('location POI', () => {
  it('a picked POI moves the call to its point and address and links it', () => {
    const values = applyLocationPoi(basics({ address: '1 Old St', latitude: '1', longitude: '2' }), POI);

    expect(values).toMatchObject({ address: '4 Engine Rd', latitude: '39.5', longitude: '-119.8', locationPoi: { poiId: 12, name: 'Station 4', point: { latitude: 39.5, longitude: -119.8 } } });
    expect(effectiveLocationPoi(values)?.poiId).toBe(12);
    // A POI without an address gives the call its name.
    expect(applyLocationPoi(basics(), { ...POI, Address: '' }).address).toBe('Station 4');
  });

  it('keeps the link while the point is the POI’s (the address may change) and drops it once the point moves', () => {
    const picked = applyLocationPoi(basics(), POI);

    const readdressed: CallFormValues = { ...picked, address: '4 Engine Rd, Bay 2' };

    expect(effectiveLocationPoi(readdressed)?.poiId).toBe(12);
    expect(effectiveLocationPoi({ ...picked, latitude: '39.500001' })?.poiId).toBe(12);
    expect(effectiveLocationPoi({ ...picked, latitude: '39.6' })).toBeNull();
    // A blank point: the server fills it from the POI.
    expect(effectiveLocationPoi({ ...picked, latitude: '', longitude: '' })?.poiId).toBe(12);
    // A POI whose point is not known (withheld) holds until cleared.
    expect(effectiveLocationPoi({ ...picked, locationPoi: { poiId: 12, name: '', point: null }, latitude: '1', longitude: '1' })?.poiId).toBe(12);
  });

  it('goes up as LocationPoiId: left out of a new call without one, 0 to clear it on an edit, absent without the picker', () => {
    const picked = applyLocationPoi(basics(), POI);

    expect(buildNewCallInput(toCreateCallRequest(picked, PICKERS)).LocationPoiId).toBe(12);
    expect(buildNewCallInput(toCreateCallRequest({ ...picked, latitude: '40' }, PICKERS))).not.toHaveProperty('LocationPoiId');

    const call = makeCall('7', { LocationPoiId: 12, LocationPoiName: 'Station 4', Latitude: '39.5', Longitude: '-119.8', Geolocation: '39.5,-119.8' });
    const edit = { call, storedProtocolCount: 0, initialDispatchOnUtc: '' };
    const isVisible = () => true;
    const moved = { ...callToFormValues(call), latitude: '40', longitude: '-120' };

    expect(buildEditCallInput(toUpdateCallRequest('7', moved, PICKERS, { edit, isVisible })).LocationPoiId).toBe(0);
    expect(buildEditCallInput(toUpdateCallRequest('7', moved, { ...PICKERS, locationPoi: false }, { edit, isVisible }))).not.toHaveProperty('LocationPoiId');
    // Neither address nor coordinates shown: the edit leaves the stored POI.
    const locationHidden = (key: NewCallFieldKey) => key !== NewCallFieldKeys.Address && key !== NewCallFieldKeys.Geolocation;
    expect(buildEditCallInput(toUpdateCallRequest('7', moved, PICKERS, { edit, isVisible: locationHidden }))).not.toHaveProperty('LocationPoiId');
  });
});

describe('free destination', () => {
  it('is one destination with the POI: switching or picking a POI clears the other', () => {
    const free = { ...withDestinationKind(basics(), 'location'), destinationAddress: '5 Oak Ave', destinationLatitude: '39.3', destinationLongitude: '-119.3' };

    expect(hasFormDestination(free)).toBe(true);
    expect(withDestinationPoi(free, 9)).toMatchObject({ destinationPoiId: 9, destinationKind: 'poi', destinationAddress: '', destinationLatitude: '' });
    expect(withDestinationKind(withDestinationPoi(free, 9), 'location')).toMatchObject({ destinationPoiId: null, destinationKind: 'location' });
    expect(hasFormDestination(basics())).toBe(false);
  });

  it('goes up as a "lat,lon" point with its address and what3words; a POI wins', () => {
    const free = basics({
      destinationKind: 'location',
      destinationAddress: '5 Oak Ave',
      destinationLatitude: '39.3',
      destinationLongitude: '-119.3',
      destinationWhat3Words: 'filled.count.soap',
      destinationPlusCode: '849VCWC8+R9',
    });

    const input = buildNewCallInput(toCreateCallRequest(free, PICKERS));

    expect(input).toMatchObject({ DestinationPoiId: null, DestinationAddress: '5 Oak Ave', DestinationGeolocation: '39.3,-119.3', DestinationWhat3Words: 'filled.count.soap' });
    // The plus code is a lookup only.
    expect(JSON.stringify(input)).not.toContain('849VCWC8');
    expect(buildNewCallInput(toCreateCallRequest(withDestinationPoi(free, 9), PICKERS))).not.toHaveProperty('DestinationAddress');
  });

  it('meets a required destination like a POI does, and checks its point like the call’s', () => {
    const policy = createFieldPolicy([{ Key: 'destinationPoi', Visible: true, Required: true }]);
    const options = { policy, validPriorityIds: [1] };

    expect(validateCallForm(basics(), options).missingPolicyFields).toEqual([NewCallFieldKeys.DestinationPoi]);
    expect(validateCallForm(basics({ destinationKind: 'location', destinationAddress: '5 Oak Ave' }), options).isValid).toBe(true);
    expect(validateCallForm(basics({ destinationPoiId: 4 }), options).isValid).toBe(true);
    expect(validateCallForm(basics({ destinationKind: 'location', destinationLatitude: '95', destinationLongitude: '10' }), options).errors).toMatchObject({ destinationLatitude: 'calls.latitude_invalid' });
    expect(validateCallForm(basics({ destinationKind: 'location', destinationLatitude: '39' }), options).errors).toMatchObject({ destinationLongitude: 'calls.coordinates_incomplete' });
  });

  it('an edit clears a free destination it no longer has, and leaves it when the department hides the destination', () => {
    const call = makeCall('7', { DestinationAddress: '5 Oak Ave', DestinationLatitude: 39.3, DestinationLongitude: -119.3, DestinationGeolocation: '39.3,-119.3' });
    const edit = { call, storedProtocolCount: 0, initialDispatchOnUtc: '' };
    const cleared = withDestinationKind(withDestinationKind(callToFormValues(call), 'poi'), 'location');

    expect(buildEditCallInput(toUpdateCallRequest('7', cleared, PICKERS, { edit, isVisible: () => true }))).toMatchObject({ DestinationAddress: '', DestinationGeolocation: '', DestinationWhat3Words: '' });

    const hidden = (key: NewCallFieldKey) => key !== NewCallFieldKeys.DestinationPoi;
    const input = buildEditCallInput(toUpdateCallRequest('7', cleared, { ...PICKERS, freeDestination: false }, { edit, isVisible: hidden }));

    expect(input).not.toHaveProperty('DestinationAddress');
    expect(input).not.toHaveProperty('DestinationGeolocation');
  });
});

describe('route', () => {
  it('fills a blank call location from its start and a missing destination from its end, never what the form holds', () => {
    const blank = applyRoutePlan(basics(), plan());

    expect(blank.filledLocation).toEqual({ latitude: 39.1, longitude: -119.1 });
    expect(blank.filledDestination).toBe(true);
    expect(blank.values).toMatchObject({ routePlanId: 'rp-1', latitude: '39.1', longitude: '-119.1', destinationKind: 'location', destinationAddress: 'General Hospital', destinationLatitude: '39.2' });

    const held = applyRoutePlan(basics({ address: '9 Elm St', destinationPoiId: 3 }), plan());
    expect(held.filledLocation).toBeNull();
    expect(held.filledDestination).toBe(false);
    expect(held.values).toMatchObject({ address: '9 Elm St', latitude: '', destinationPoiId: 3, routePlanId: 'rp-1' });

    expect(applyRoutePlan(basics(), plan(), { location: false, destination: false }).values).toMatchObject({ latitude: '', destinationLatitude: '', routePlanId: 'rp-1' });
    expect(applyRoutePlan(blank.values, null).values).toMatchObject({ routePlanId: null, latitude: '39.1' });
  });

  it('goes up as RoutePlanId: left out of a new call without one and cleared ("") on an edit', () => {
    expect(buildNewCallInput(toCreateCallRequest(basics({ routePlanId: 'rp-1' }), PICKERS)).RoutePlanId).toBe('rp-1');
    expect(buildNewCallInput(toCreateCallRequest(basics(), PICKERS))).not.toHaveProperty('RoutePlanId');
    // Pending and scheduled calls carry it too.
    expect(buildNewCallInput(toCreateCallRequest(basics({ routePlanId: 'rp-1', isPending: true }), PICKERS))).toMatchObject({ RoutePlanId: 'rp-1', IsPending: true });

    const call = makeCall('7', { RoutePlanId: 'rp-1', RoutePlanName: 'Hydrant loop' });
    const edit = { call, storedProtocolCount: 0, initialDispatchOnUtc: '' };
    expect(buildEditCallInput(toUpdateCallRequest('7', { ...callToFormValues(call), routePlanId: null }, PICKERS, { edit, isVisible: () => true })).RoutePlanId).toBe('');
    expect(buildEditCallInput(toUpdateCallRequest('7', callToFormValues(call), { ...PICKERS, route: false }, { edit, isVisible: () => true }))).not.toHaveProperty('RoutePlanId');
  });

  it('describes a plan in one line and searches by name, description and ends', () => {
    expect(callRoutePlanSummary(plan(), t)).toBe('calls.route_stops_count:5 · 12.4 km · unit_routes.duration_minutes:25');
    expect(callRoutePlanEndpoints(plan(), t)).toBe('calls.route_start_end:Station 1,General Hospital');
    expect(routeEndpointText({ Name: '', Latitude: 39.123456, Longitude: -119.1 })).toBe('39.12346, -119.1');
    const plans = [plan({ RoutePlanId: 'b', Name: 'Zeta' }), plan({ RoutePlanId: 'a', Name: 'Alpha', End: { Latitude: 1, Longitude: 1, DepartmentGroupId: null, Name: 'Dump site' } })];
    expect(filterCallRoutePlans(plans, '').map((entry) => entry.RoutePlanId)).toEqual(['a', 'b']);
    expect(filterCallRoutePlans(plans, 'dump').map((entry) => entry.RoutePlanId)).toEqual(['a']);
  });
});

describe('edit prefill and correction', () => {
  it('starts an edit from the call’s location POI, free destination and route', () => {
    const call = makeCall('7', {
      Latitude: '39.5',
      Longitude: '-119.8',
      LocationPoiId: 12,
      LocationPoiName: 'Station 4',
      DestinationAddress: '5 Oak Ave',
      DestinationLatitude: 39.30001,
      DestinationLongitude: -119.3,
      DestinationGeolocation: '39.3,-119.3',
      DestinationWhat3Words: 'filled.count.soap',
      RoutePlanId: 'rp-1',
    });

    expect(callToFormValues(call)).toMatchObject({
      locationPoi: { poiId: 12, name: 'Station 4', point: { latitude: 39.5, longitude: -119.8 } },
      destinationPoiId: null,
      destinationKind: 'location',
      destinationAddress: '5 Oak Ave',
      destinationLatitude: '39.3',
      destinationLongitude: '-119.3',
      destinationWhat3Words: 'filled.count.soap',
      routePlanId: 'rp-1',
    });
    // A POI destination stays a POI (Core fills DestinationAddress from it).
    expect(callToFormValues(makeCall('8', { DestinationPoiId: 3, DestinationName: 'Mercy', DestinationAddress: '1 Health Way' }))).toMatchObject({ destinationPoiId: 3, destinationKind: 'poi', destinationAddress: '' });
  });

  it('starts a correction from the refused request’s location POI, free destination and route', () => {
    const request: CreateCallRequest = {
      name: 'Transfer',
      nature: 'Patient transfer',
      priority: 1,
      latitude: 39.5,
      longitude: -119.8,
      locationPoiId: 12,
      destinationAddress: '5 Oak Ave',
      destinationGeolocation: { latitude: 39.3, longitude: -119.3 },
      routePlanId: 'rp-1',
    };

    expect(createRequestToFormValues(request)).toMatchObject({
      locationPoi: { poiId: 12, point: { latitude: 39.5, longitude: -119.8 } },
      destinationKind: 'location',
      destinationAddress: '5 Oak Ave',
      destinationLatitude: '39.3',
      routePlanId: 'rp-1',
    });
  });

  it('names a call’s destination in one line: the POI, else the free destination', () => {
    expect(callDestinationText(makeCall('1', { DestinationPoiId: 3, DestinationName: 'Mercy', DestinationAddress: '1 Health Way' }))).toBe('Mercy');
    expect(callDestinationText(makeCall('1', { DestinationAddress: '5 Oak Ave', DestinationLatitude: 39.3, DestinationLongitude: -119.3 }))).toBe('5 Oak Ave');
    expect(callDestinationText(makeCall('1', { DestinationWhat3Words: 'filled.count.soap' }))).toBe('///filled.count.soap');
    expect(callDestinationText(makeCall('1'))).toBe('');
  });
});
