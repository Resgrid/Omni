import type { GetWeatherAlertResult } from '@resgrid/models';

import { type ApiContext, type RequestOptions } from '../../core';
import { getWeatherAlert, weatherAlertsEndpoints } from './weather-alerts';

/** Domain error for weather-alert fetch failures (IC): carries the alert id and endpoint, hides transport details. */
export class WeatherAlertFetchError extends Error {
  public readonly alertId: string;
  public readonly endpoint: string;
  public override readonly cause?: unknown;

  constructor(alertId: string, endpoint: string, cause: unknown) {
    super(`Unable to load weather alert ${alertId}`);
    this.name = 'WeatherAlertFetchError';
    this.alertId = alertId;
    this.endpoint = endpoint;
    this.cause = cause;
  }
}

/** `getWeatherAlert` that rejects with {@link WeatherAlertFetchError} (the id travels in the path, per Core). */
export const fetchWeatherAlert = async (ctx: ApiContext, alertId: string, options?: RequestOptions): Promise<GetWeatherAlertResult> => {
  try {
    return await getWeatherAlert(ctx, { alertId }, options);
  } catch (error) {
    throw new WeatherAlertFetchError(alertId, weatherAlertsEndpoints.getWeatherAlert.path, error);
  }
};
