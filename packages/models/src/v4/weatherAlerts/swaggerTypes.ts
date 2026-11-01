// Core v4 request/response shapes no legacy app modelled, generated from Swagger v4 (packages/api/contract/swagger-v4.json). Resgrid.Model entities referenced by them are typed as records until modelled.

import type { WeatherAlertResultData } from './weatherAlertResultData';
import type { WeatherAlertSeverityScheduleData } from './weatherAlertSettingsData';

/** Core `v4.WeatherAlerts.GetWeatherAlertResult` (generated from Swagger v4). */
export interface GetWeatherAlertResult {
  Data?: WeatherAlertResultData;
  /** Number of records returned */
  PageSize?: number;
  /** The requested page size */
  Page?: number;
  /** Timestamp in UTC of the operation */
  Timestamp?: string;
  /** API Version that produced the response */
  Version?: string | null;
  /** Name of the node the processed the operation */
  Node?: string | null;
  /** Name of the environment that the api is running under */
  Environment?: string | null;
  /** Trace or Request Id for the operation */
  RequestId?: string | null;
  /** Status of the Response */
  Status?: string | null;
  /** If pagination values were supplied what is the previous page url (if empty this is the first page) */
  PreviousPageUrl?: string | null;
  /** If pagination values were supplied what is the next page url (if empty there is no more records) */
  NextPageUrl?: string | null;
}

/** Core `v4.WeatherAlerts.SaveWeatherAlertSettingsInput` (generated from Swagger v4). */
export interface SaveWeatherAlertSettingsInput {
  WeatherAlertsEnabled?: boolean;
  MinimumSeverity?: number;
  AutoMessageSeverity?: number;
  CallIntegrationEnabled?: boolean;
  AutoMessageSchedule?: WeatherAlertSeverityScheduleData[] | null;
  ExcludedEvents?: string | null;
}

/** Core `v4.WeatherAlerts.SaveWeatherAlertSourceInput` (generated from Swagger v4). */
export interface SaveWeatherAlertSourceInput {
  WeatherAlertSourceId?: string | null;
  Name?: string | null;
  SourceType?: number;
  AreaFilter?: string | null;
  ApiKey?: string | null;
  CustomEndpoint?: string | null;
  PollIntervalMinutes?: number;
  Active?: boolean;
}

/** Core `v4.WeatherAlerts.SaveWeatherAlertZoneInput` (generated from Swagger v4). */
export interface SaveWeatherAlertZoneInput {
  WeatherAlertZoneId?: string | null;
  Name?: string | null;
  ZoneCode?: string | null;
  CenterGeoLocation?: string | null;
  RadiusMiles?: number;
  IsActive?: boolean;
  IsPrimary?: boolean;
}
