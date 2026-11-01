export interface WeatherAlertSeverityScheduleData {
  Severity: number;
  Enabled: boolean;
  StartHour: number;
  EndHour: number;
}

export interface WeatherAlertSettingsData {
  WeatherAlertsEnabled: boolean;
  MinimumSeverity: number;
  AutoMessageSeverity: number;
  CallIntegrationEnabled: boolean;
  AutoMessageSchedule: WeatherAlertSeverityScheduleData[];
  ExcludedEvents: string;
}
