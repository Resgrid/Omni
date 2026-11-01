import type { GetDepartmentSsoConfigResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for auth-discovery (Connect). The contract test checks every entry against Swagger. */
export const authDiscoveryEndpoints = defineEndpoints('auth-discovery', {
  getSsoConfig: { method: 'GET', path: '/Connect/sso-config', query: ['departmentToken', 'departmentCode'], anonymous: true },
  getSsoConfigForUser: { method: 'GET', path: '/Connect/sso-config-for-user', query: ['username', 'departmentId'], anonymous: true },
});

const E = authDiscoveryEndpoints;

/** Returns the SSO configuration for a department so the mobile app can determine whether to show the SSO login button, which flow to use (OIDC/SAML), and which parameters to pass. Call this before showing the login screen. `GET /Connect/sso-config`. */
export const getSsoConfig = (ctx: ApiContext, params: { departmentToken?: string; departmentCode?: string } = {}, options?: RequestOptions): Promise<GetDepartmentSsoConfigResult> =>
  request<GetDepartmentSsoConfigResult>(ctx, E.getSsoConfig, { params }, options);

/** Returns the SSO configuration for a user's department, resolved by username. Intended for the mobile app pre-login screen — call this with just a username to discover whether SSO is required before the user enters credentials. If departmentId is supplied the lookup is scoped to that specific department; otherwise the user's default/active department is used. No credentials are required — this endpoint is public (anonymous). `GET /Connect/sso-config-for-user`. */
export const getSsoConfigForUser = (ctx: ApiContext, params: { username: string; departmentId?: number | string }, options?: RequestOptions): Promise<GetDepartmentSsoConfigResult> =>
  request<GetDepartmentSsoConfigResult>(ctx, E.getSsoConfigForUser, { params }, options);
