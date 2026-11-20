import { createTestContext, httpError, lastRequest, ok } from '../../__tests__/helpers';
import * as api from '../../index';

// Core M0322: call start/destination locations and call routes (contract: call-locations-routes, 2026-11-19).
const body = (config: { data?: unknown }) => JSON.parse(String(config.data));

const base = { name: 'Transfer', nature: 'Interfacility', priority: 1 };

describe('call location fields (SaveCall / EditCall)', () => {
  it('leaves every new field out when the form has no input for it (legacy-safe)', async () => {
    const { ctx, adapter } = createTestContext();
    await api.createCall(ctx, base);
    const created = body(lastRequest(adapter));
    await api.updateCall(ctx, { ...base, callId: '9' });
    const edited = body(lastRequest(adapter));

    for (const sent of [created, edited]) {
      for (const field of ['LocationPoiId', 'DestinationAddress', 'DestinationGeolocation', 'DestinationWhat3Words', 'RoutePlanId']) expect(sent).not.toHaveProperty(field);
    }
  });

  it('sends a picked location POI, free destination and route on a new call, formatted like Geolocation', async () => {
    const { ctx, adapter } = createTestContext();
    await api.createCall(ctx, {
      ...base,
      locationPoiId: 41,
      destinationAddress: '  12 Main St ',
      destinationGeolocation: { latitude: 39.5, longitude: -119.8 },
      destinationWhat3Words: 'filled.count.soap',
      routePlanId: 'rp-1',
    });
    expect(body(lastRequest(adapter))).toMatchObject({
      LocationPoiId: 41,
      DestinationAddress: '12 Main St',
      DestinationGeolocation: '39.5,-119.8',
      DestinationWhat3Words: 'filled.count.soap',
      RoutePlanId: 'rp-1',
    });
  });

  it('leaves blank values out of a new call (nothing to clear yet)', async () => {
    const { ctx, adapter } = createTestContext();
    await api.createCall(ctx, { ...base, locationPoiId: null, destinationAddress: ' ', destinationGeolocation: { latitude: 0, longitude: 0 }, destinationWhat3Words: null, routePlanId: '' });
    const sent = body(lastRequest(adapter));

    for (const field of ['LocationPoiId', 'DestinationAddress', 'DestinationGeolocation', 'DestinationWhat3Words', 'RoutePlanId']) expect(sent).not.toHaveProperty(field);
  });

  it('clears on an edit with 0 / "" (null keeps the stored value on the server)', async () => {
    const { ctx, adapter } = createTestContext();
    await api.updateCall(ctx, { ...base, callId: '9', locationPoiId: null, destinationAddress: null, destinationGeolocation: null, destinationWhat3Words: '', routePlanId: null });
    expect(body(lastRequest(adapter))).toMatchObject({ Id: '9', LocationPoiId: 0, DestinationAddress: '', DestinationGeolocation: '', DestinationWhat3Words: '', RoutePlanId: '' });
  });

  it('lets a destination POI win: a new call sends no free destination, an edit clears it', async () => {
    const { ctx, adapter } = createTestContext();
    const free = { destinationAddress: '12 Main St', destinationGeolocation: { latitude: 39.5, longitude: -119.8 }, destinationWhat3Words: 'a.b.c' };

    await api.createCall(ctx, { ...base, destinationPoiId: 7, ...free });
    const created = body(lastRequest(adapter));
    expect(created).toMatchObject({ DestinationPoiId: 7 });
    expect(created).not.toHaveProperty('DestinationAddress');
    expect(created).not.toHaveProperty('DestinationGeolocation');

    await api.updateCall(ctx, { ...base, callId: '9', destinationPoiId: 7, ...free });
    expect(body(lastRequest(adapter))).toMatchObject({ DestinationPoiId: 7, DestinationAddress: '', DestinationGeolocation: '', DestinationWhat3Words: '' });
  });
});

describe('call routes (Routes v4, Core M0322)', () => {
  it('reads the routes a call may run through the endpoint cache', async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementation(async (config) => ok(config, { Status: 'success', Data: [{ RoutePlanId: 'rp-1' }] }));
    await api.getCallRoutePlans(ctx);
    await api.getCallRoutePlans(ctx);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(lastRequest(adapter)).toMatchObject({ method: 'get', url: '/Routes/GetCallRoutePlans' });
    await api.getCallRoutePlans(ctx, { forceRefresh: true });
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it('posts StartCallRoute and ReachRouteStart as JSON', async () => {
    const { ctx, adapter } = createTestContext();
    await api.startCallRoute(ctx, { CallId: 42, UnitId: 10 });
    expect(lastRequest(adapter)).toMatchObject({ method: 'post', url: '/Routes/StartCallRoute' });
    expect(body(lastRequest(adapter))).toEqual({ CallId: 42, UnitId: 10 });
    await api.reachRouteStart(ctx, { RouteInstanceId: 'ri-1', Latitude: 39.5, Longitude: -119.8 });
    expect(lastRequest(adapter)).toMatchObject({ method: 'post', url: '/Routes/ReachRouteStart' });
    expect(body(lastRequest(adapter))).toEqual({ RouteInstanceId: 'ri-1', Latitude: 39.5, Longitude: -119.8 });
  });

  it('asks for the leading route-start leg only when told to', async () => {
    const { ctx, adapter } = createTestContext();
    await api.getInstanceDirections(ctx, { instanceId: 'ri-1', latitude: 39.5, longitude: -119.8 });
    expect(lastRequest(adapter).url).toBe('/Routes/GetInstanceDirections/ri-1?latitude=39.5&longitude=-119.8');
    await api.getInstanceDirections(ctx, { instanceId: 'ri-1', latitude: 39.5, longitude: -119.8, includeStart: true });
    expect(lastRequest(adapter).url).toBe('/Routes/GetInstanceDirections/ri-1?latitude=39.5&longitude=-119.8&includeStart=true');
  });

  it('surfaces a 409 route_in_progress with the running instance id from the ProblemDetails', async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementationOnce(async (config) => {
      throw httpError(config, 409, { type: 'route_in_progress', title: 'Conflict', status: 409, detail: 'ri-other' });
    });
    const error = await api.startCallRoute(ctx, { CallId: 42, UnitId: 10 }).catch((caught: Error) => caught);
    expect(api.isApiError(error)).toBe(true);

    if (!api.isApiError(error)) return;
    expect(error).toMatchObject({ status: 409, problemType: api.ProblemTypes.RouteInProgress });
    expect(api.problemDetailOf(error)).toBe('ri-other');
  });
});
