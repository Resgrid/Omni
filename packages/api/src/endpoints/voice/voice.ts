import type { CanConnectToVoiceSessionResult, DepartmentAudioResult, DepartmentVoiceResult, VoiceSessionConnectionResult } from '@resgrid/models';

import { type ApiContext, cachedRequest, type CachedRequestOptions, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for voice (Voice). The contract test checks every entry against Swagger. */
export const voiceEndpoints = defineEndpoints('voice', {
  canConnectToVoiceSession: { method: 'GET', path: '/Voice/CanConnectToVoiceSession', query: ['token'] },
  connectToVoiceSession: { method: 'GET', path: '/Voice/ConnectToSession', query: ['sessionId'] },
  getDepartmentAudioStreams: { method: 'GET', path: '/Voice/GetDepartmentAudioStreams', cacheTtlMs: 15 * 60 * 1000 },
  getDepartmentVoiceSettings: { method: 'GET', path: '/Voice/GetDepartmentVoiceSettings', cacheTtlMs: 15 * 60 * 1000 },
});

const E = voiceEndpoints;

/** Determines if a user can connect to an voice session, limited to only LiveKit. `GET /Voice/CanConnectToVoiceSession` — legacy: BDIRU. */
export const canConnectToVoiceSession = (ctx: ApiContext, params: { token?: string } = {}, options?: RequestOptions): Promise<CanConnectToVoiceSessionResult> =>
  request<CanConnectToVoiceSessionResult>(ctx, E.canConnectToVoiceSession, { params }, options);

/** Connects to an voip session, limited to only OpenVidu. `GET /Voice/ConnectToSession` — legacy: BDIRU. */
export const connectToVoiceSession = (ctx: ApiContext, params: { sessionId: string }, options?: RequestOptions): Promise<VoiceSessionConnectionResult> =>
  request<VoiceSessionConnectionResult>(ctx, E.connectToVoiceSession, { params }, options);

/** Returns all the department audio streams. `GET /Voice/GetDepartmentAudioStreams` (cached) — legacy: BDIRU. */
export const getDepartmentAudioStreams = (ctx: ApiContext, options?: CachedRequestOptions): Promise<DepartmentAudioResult> => cachedRequest<DepartmentAudioResult>(ctx, E.getDepartmentAudioStreams, {}, options);

/** Returns all the available responding options (Calls/Stations) for the department. `GET /Voice/GetDepartmentVoiceSettings` (cached) — legacy: BDIRU. */
export const getDepartmentVoiceSettings = (ctx: ApiContext, options?: CachedRequestOptions): Promise<DepartmentVoiceResult> => cachedRequest<DepartmentVoiceResult>(ctx, E.getDepartmentVoiceSettings, {}, options);
