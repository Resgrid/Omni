import type { FeatureToggleResult, FeatureTogglesResult } from '@resgrid/models';

import { type ApiContext, defineEndpoints, request, type RequestOptions } from '../../core';

/** Core v4 endpoints for feature-flags (FeatureToggles). The contract test checks every entry against Swagger. */
export const featureFlagsEndpoints = defineEndpoints('feature-flags', {
  getAllFeatureFlags: { method: 'GET', path: '/FeatureToggles/GetAll' },
  getFeatureFlagState: { method: 'GET', path: '/FeatureToggles/GetState', query: ['key'] },
});

const E = featureFlagsEndpoints;

/** Evaluates every active flag for the caller's department. Supports ETag/If-None-Match polling. `GET /FeatureToggles/GetAll` — legacy: DIRU. */
export const getAllFeatureFlags = (ctx: ApiContext, options?: RequestOptions): Promise<FeatureTogglesResult> => request<FeatureTogglesResult>(ctx, E.getAllFeatureFlags, {}, options);

/** Lightweight enabled-only check for a single flag. `GET /FeatureToggles/GetState` — legacy: DIRU. */
export const getFeatureFlagState = (ctx: ApiContext, params: { key?: string } = {}, options?: RequestOptions): Promise<FeatureToggleResult> =>
  request<FeatureToggleResult>(ctx, E.getFeatureFlagState, { params }, options);
