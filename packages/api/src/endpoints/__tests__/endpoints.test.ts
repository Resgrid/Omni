import fs from 'node:fs';
import path from 'node:path';

import axios from 'axios';

import { BASE_URL, createTestContext, lastRequest, networkError, ok } from '../../__tests__/helpers';
import * as api from '../../index';
import { WeatherAlertFetchError } from '../weather-alerts';

const body = (config: { data?: unknown }) => JSON.parse(String(config.data));

describe('calls (Dispatch superset)', () => {
  it('caches active calls for 30 s and refreshes on demand', async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementation(async (config) => ok(config, { Status: 'success', Data: [{ CallId: '1' }] }));
    await api.getActiveCalls(ctx);
    await api.getActiveCalls(ctx);
    expect(adapter).toHaveBeenCalledTimes(1);
    await api.getActiveCalls(ctx, { forceRefresh: true });
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(api.callsEndpoints.getActiveCalls.cacheTtlMs).toBe(30_000);
  });

  it('gets a call by id (query) and keeps the CallPriorities wire typo', async () => {
    const { ctx, adapter } = createTestContext();
    await api.getCall(ctx, { callId: '42' });
    expect(lastRequest(adapter).url).toBe('/Calls/GetCall?callId=42');
    await api.getAllCallPriorities(ctx);
    expect(lastRequest(adapter).url).toBe('/CallPriorities/GetAllCallPriorites');
  });

  it('builds the dispatch list and omits fields the screen has no picker for', async () => {
    const { ctx, adapter } = createTestContext();
    await api.createCall(ctx, { name: 'Fire', nature: 'Smoke', priority: 2, latitude: 0, longitude: 0, dispatchUsers: ['u1'], dispatchGroups: ['g1'], dispatchUnits: ['7'], dispatchOnUtc: '2026-11-01T10:00:00Z' });
    const sent = body(lastRequest(adapter));
    expect(lastRequest(adapter).url).toBe('/Calls/SaveCall');
    expect(sent).toMatchObject({ Name: 'Fire', Nature: 'Smoke', Priority: 2, Geolocation: '', DispatchList: 'P:u1|G:g1|U:7', DispatchOnUtc: '2026-11-01T10:00:00Z', IsPending: false });
    expect(sent).not.toHaveProperty('LinkedCallId');
    expect(sent).not.toHaveProperty('ProtocolIds');
    expect(sent).not.toHaveProperty('UdfValues');
    expect(sent).not.toHaveProperty('ContactId');
    expect(sent).not.toHaveProperty('PlusCode');
  });

  it('saves a pending call without a dispatch time and sends pickers that were shown', async () => {
    const { ctx, adapter } = createTestContext();
    await api.createCall(ctx, { name: 'A', nature: 'B', priority: 0, isPending: true, dispatchOnUtc: '2026-11-01T10:00:00Z', dispatchEveryone: true, linkedCallId: '', protocolIds: [], latitude: 39.1, longitude: -84.5 });
    const sent = body(lastRequest(adapter));
    expect(sent).toMatchObject({ IsPending: true, DispatchList: '0', LinkedCallId: '', ProtocolIds: [], Geolocation: '39.1,-84.5' });
    expect(sent).not.toHaveProperty('DispatchOnUtc');
  });

  it('edits (EditCall, never UpdateCall) and closes calls', async () => {
    const { ctx, adapter } = createTestContext();
    await api.updateCall(ctx, { callId: '9', name: 'A', nature: 'B', priority: 1 });
    expect(lastRequest(adapter)).toMatchObject({ url: '/Calls/EditCall', method: 'put' });
    expect(body(lastRequest(adapter))).toMatchObject({ Id: '9', RebroadcastCall: false, NotifyCancelledEntities: false });
    await api.closeCallWith(ctx, { callId: '9', type: 1 });
    expect(body(lastRequest(adapter))).toEqual({ Id: '9', Type: 1, Notes: '' });
    expect(api.buildDispatchList({})).toBe('');
    expect(api.formatGeolocation(91, 0)).toBe('');
    expect(api.formatGeolocation(0, 10)).toBe('0,10');
  });
});

describe('call files (Responder: token only to its own host)', () => {
  it('drops a 0,0 fix and sends coordinates as strings', () => {
    expect(api.buildSaveCallFileInput({ callId: '1', userId: 'u', type: api.CallFileType.Image, name: 'a.jpg', data: 'AA==', latitude: 0, longitude: 0 })).not.toHaveProperty('Latitude');
    expect(api.buildSaveCallFileInput({ callId: '1', userId: 'u', type: 2, name: 'a.jpg', data: 'AA==', latitude: 39.5, longitude: -84 })).toMatchObject({ Latitude: '39.5', Longitude: '-84', Note: '' });
  });

  it('attaches the bearer for API-origin downloads only', async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementation(async (config) => ok(config, 'blob'));
    await api.downloadCallAttachment(ctx, `${BASE_URL}/CallFiles/GetFile?id=1`);
    expect(lastRequest(adapter).headers.Authorization).toBe('Bearer access-token');

    const external = jest.spyOn(axios, 'get').mockResolvedValue({ data: 'cdn-blob' });
    await expect(api.downloadCallAttachment(ctx, 'https://cdn.example.com/f?sig=abc')).resolves.toBe('cdn-blob');
    expect(external).toHaveBeenCalledWith('https://cdn.example.com/f?sig=abc', expect.not.objectContaining({ headers: expect.anything() }));
    expect(adapter).toHaveBeenCalledTimes(1);
    external.mockRestore();
  });
});

describe('check-in timers (IC baseline)', () => {
  it('toggles timers with query parameters, not a JSON body', async () => {
    const { ctx, adapter } = createTestContext();
    await api.toggleCallTimers(ctx, { callId: 12, enabled: true });
    expect(lastRequest(adapter)).toMatchObject({ method: 'put', url: '/CheckInTimers/ToggleCallTimers?callId=12&enabled=true' });
    expect(lastRequest(adapter).data).toBeUndefined();
  });

  it('performs a check-in with a JSON body', async () => {
    const { ctx, adapter } = createTestContext();
    await api.performCheckIn(ctx, { CallId: 12, CheckInType: 0 });
    expect(body(lastRequest(adapter))).toEqual({ CallId: 12, CheckInType: 0 });
  });
});

describe('mapping (IC path params + Responder legend + Dispatch GeoJSON)', () => {
  it('sends ids in the path', async () => {
    const { ctx, adapter } = createTestContext();
    await api.getIndoorMapFloor(ctx, { floorId: 'f-1' });
    expect(lastRequest(adapter).url).toBe('/Mapping/GetIndoorMapFloor/f-1');
    await api.getMapLayerGeoJSON(ctx, { layerId: 'L1' });
    expect(lastRequest(adapter).url).toBe('/Mapping/GetMapLayerGeoJSON/L1');
  });

  it('wraps the GetMayLayers typo as getMapLayers', async () => {
    const { ctx, adapter } = createTestContext();
    await api.getMapLayers(ctx, { type: 1 });
    expect(lastRequest(adapter).url).toBe('/Mapping/GetMayLayers?type=1');
  });

  it('caches a POI by its resolved path', async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementation(async (config) => ok(config, { Status: 'success', Data: { PoiId: 5 } }));
    await api.getPoi(ctx, { poiId: 5 });
    await api.getPoi(ctx, { poiId: 5 });
    await api.getPoi(ctx, { poiId: 6 });
    expect(adapter).toHaveBeenCalledTimes(2);
  });
});

describe('units, personnel and statuses', () => {
  it('serves units from cache and offline, refreshing on demand (R/U + D/B force refresh)', async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementationOnce(async (config) => ok(config, { Status: 'success', Data: [{ UnitId: '1' }] }));
    await api.getAllUnitsInfos(ctx);
    adapter.mockImplementation(async (config) => {
      throw networkError(config);
    });
    await expect(api.getAllUnitsInfos(ctx, {}, { forceRefresh: true })).resolves.toMatchObject({ Data: [{ UnitId: '1' }] });
  });

  it('uses GetCurrentStaffing (the correctly spelled alias) and the personnel filter options', async () => {
    const { ctx, adapter } = createTestContext();
    await api.getCurrentStaffing(ctx, { userId: 'u1' });
    expect(lastRequest(adapter).url).toBe('/PersonnelStaffing/GetCurrentStaffing?userId=u1');
    await api.getPersonnelFilterOptions(ctx);
    expect(lastRequest(adapter).url).toBe('/Personnel/GetPersonnelFilterOptions');
  });

  it('saves a unit status', async () => {
    const { ctx, adapter } = createTestContext();
    await api.saveUnitStatus(ctx, { Id: '7', Type: '3', Timestamp: '2026-10-31T10:00:00', TimestampUtc: '2026-10-31T15:00:00Z' });
    expect(lastRequest(adapter)).toMatchObject({ method: 'post', url: '/UnitStatus/SaveUnitStatus' });
  });
});

describe('chat (IC + Dispatch call filter)', () => {
  it('has one getChatChannels signature with the call filter', async () => {
    const { ctx, adapter } = createTestContext();
    await api.getChatChannels(ctx);
    expect(lastRequest(adapter).url).toBe('/Chat/GetChannels');
    await api.getChatChannels(ctx, { callId: 55, includeArchived: false });
    expect(lastRequest(adapter).url).toBe('/Chat/GetChannels?callId=55&includeArchived=false');
  });

  it('uploads attachments as multipart and builds authenticated image sources', async () => {
    const { ctx, adapter } = createTestContext();
    const form = new FormData();
    await api.uploadChatAttachment(ctx, { channelId: 'c1' }, form);
    expect(lastRequest(adapter)).toMatchObject({ url: '/Chat/UploadAttachment?channelId=c1', data: form });
    expect(api.getChatAttachmentImageSource(ctx, 'a 1', 'tok', true)).toEqual({ uri: `${BASE_URL}/Chat/GetAttachmentThumbnail?attachmentId=a+1`, headers: { Authorization: 'Bearer tok' } });
    expect(api.getChatAttachmentImageSource(ctx, 'a1', null)).toEqual({ uri: `${BASE_URL}/Chat/GetAttachment?attachmentId=a1` });
  });
});

describe('devices (push registration per subject)', () => {
  const device = { token: 't', platform: 1, deviceUuid: 'd', prefix: 'DEPT' };

  it('registers users, units and IC users on the right endpoint and source', async () => {
    const { ctx, adapter } = createTestContext();
    await api.registerPushDevice(ctx, { kind: 'user' }, device);
    expect(lastRequest(adapter).url).toBe('/Devices/RegisterDevice');
    expect(body(lastRequest(adapter))).toEqual({ Platform: 1, Token: 't', DeviceUuid: 'd', Prefix: 'DEPT' });

    await api.registerPushDevice(ctx, { kind: 'unit', unitId: '9' }, device);
    expect(lastRequest(adapter).url).toBe('/Devices/RegisterUnitDevice');
    expect(body(lastRequest(adapter))).toMatchObject({ UnitId: '9' });

    await api.registerPushDevice(ctx, { kind: 'icUser' }, device);
    expect(body(lastRequest(adapter))).toMatchObject({ Source: 'IC' });

    await api.unregisterPushToken(ctx, { kind: 'unit', unitId: '9' }, 'native', { token: 't', prefix: 'DEPT' });
    expect(lastRequest(adapter).url).toBe('/Devices/UnRegisterNativePush');
    expect(body(lastRequest(adapter))).toEqual({ Token: 't', Prefix: 'DEPT', UnitId: '9' });
  });
});

describe('config, discovery and anonymous endpoints', () => {
  it('fetches system config and SSO discovery without a session', async () => {
    const { ctx, adapter, auth } = createTestContext();
    auth.accessToken = null;
    auth.active = false;
    await api.getSystemConfig(ctx);
    expect(lastRequest(adapter).headers.Authorization).toBeUndefined();
    await api.getSsoConfigForUser(ctx, { username: 'jane', departmentId: 3 });
    expect(lastRequest(adapter).url).toBe('/Connect/sso-config-for-user?username=jane&departmentId=3');
    await expect(api.getConfig(ctx, { key: 'unit' })).rejects.toBeInstanceOf(api.NoActiveSessionError);
  });

  it('reads department config (BigBoard) and terminology', async () => {
    const { ctx, adapter } = createTestContext();
    await api.getDepartmentConfig(ctx, { key: 'bigboard' });
    expect(lastRequest(adapter).url).toBe('/Config/GetDepartmentConfig?key=bigboard');
    await api.getTerminology(ctx);
    expect(lastRequest(adapter).url).toBe('/Config/GetTerminology');
  });
});

describe('weather alerts (Dispatch + IC error class)', () => {
  it('sends the alert id in the path and wraps failures', async () => {
    const { ctx, adapter } = createTestContext();
    await api.getWeatherAlert(ctx, { alertId: 'w1' });
    expect(lastRequest(adapter).url).toBe('/WeatherAlerts/GetWeatherAlert/w1');
    adapter.mockImplementation(async (config) => {
      throw networkError(config);
    });
    const error = await api.fetchWeatherAlert(ctx, 'w2').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WeatherAlertFetchError);
    expect(error).toMatchObject({ alertId: 'w2', endpoint: '/WeatherAlerts/GetWeatherAlert/{alertId}' });
  });
});

describe('incident command (IC + Dispatch templates/reports)', () => {
  it('uses path routes and command definitions', async () => {
    const { ctx, adapter } = createTestContext();
    await api.getCommandBoard(ctx, { callId: 77 });
    expect(lastRequest(adapter).url).toBe('/IncidentCommand/GetCommandBoard/77');
    await api.getResourceIncidentView(ctx, { callId: 77, unitId: 3 });
    expect(lastRequest(adapter).url).toBe('/IncidentCommand/GetResourceIncidentView/77?unitId=3');
    await api.getAllCommandDefinitions(ctx);
    expect(lastRequest(adapter).url).toBe('/Commands/GetAllCommands');
    await api.getAfterActionReport(ctx, { callId: 77 });
    expect(lastRequest(adapter).url).toBe('/IncidentReporting/GetAfterActionReport/77');
  });
});

describe('inbox, records, images', () => {
  it('deletes inbox messages (Unit)', async () => {
    const { ctx, adapter } = createTestContext();
    await api.deleteInboxMessage(ctx, { messageId: 'm1' });
    expect(lastRequest(adapter)).toMatchObject({ method: 'delete', url: '/Inbox/DeleteMessage?messageId=m1' });
  });

  it('returns checklist images as data URIs and refuses non-images', async () => {
    const { ctx, adapter } = createTestContext();
    adapter.mockImplementationOnce(async (config) => ok(config, new Uint8Array([102, 111, 111]).buffer, 200, { 'content-type': 'image/png; charset=binary' }));
    await expect(api.getChecklistRunImage(ctx, 'f1')).resolves.toBe('data:image/png;base64,Zm9v');
    expect(lastRequest(adapter)).toMatchObject({ url: '/ChecklistRuns/GetChecklistRunFile?id=f1', responseType: 'arraybuffer' });
    adapter.mockImplementationOnce(async (config) => ok(config, new Uint8Array([1]).buffer, 200, { 'content-type': 'text/html' }));
    await expect(api.getWorkOrderImage(ctx, 'w1')).rejects.toThrow('Unsupported image');
  });
});

describe('package surface', () => {
  it('exports every domain function from the package root without name collisions', () => {
    const root = path.resolve(__dirname, '..');
    const folders = fs.readdirSync(root).filter((entry) => entry !== '__tests__' && fs.statSync(path.join(root, entry)).isDirectory());
    expect(folders.length).toBeGreaterThan(40);
    for (const folder of folders) {
      const domain = jest.requireActual<Record<string, unknown>>(path.join(root, folder));
      for (const [name, value] of Object.entries(domain)) {
        expect([folder, name, (api as Record<string, unknown>)[name] === value]).toEqual([folder, name, true]);
      }
    }
  });

  it('every registry entry has a matching exported function name', () => {
    const missing = api.endpointRegistry.map((d) => d.name.split('.')[1]).filter((name) => typeof (api as Record<string, unknown>)[name] !== 'function');
    expect(missing).toEqual([]);
  });
});
