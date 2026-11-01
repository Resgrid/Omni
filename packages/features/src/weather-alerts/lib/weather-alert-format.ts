import { parseUtcMs } from '@resgrid/core/utils/dates';
import { SEVERITY_COLORS, WeatherAlertCategory, WeatherAlertCertainty, type WeatherAlertResultData, WeatherAlertSeverity, WeatherAlertStatus, WeatherAlertUrgency } from '@resgrid/models';

/** Translation keys for Core's weather enums (numeric on the wire; unknown values fall back to "Unknown"/"Other"). */
const SEVERITY_KEYS: Record<number, string> = {
  [WeatherAlertSeverity.Extreme]: 'weather_alerts.severity.extreme',
  [WeatherAlertSeverity.Severe]: 'weather_alerts.severity.severe',
  [WeatherAlertSeverity.Moderate]: 'weather_alerts.severity.moderate',
  [WeatherAlertSeverity.Minor]: 'weather_alerts.severity.minor',
  [WeatherAlertSeverity.Unknown]: 'weather_alerts.severity.unknown',
};
const CATEGORY_KEYS: Record<number, string> = {
  [WeatherAlertCategory.Met]: 'weather_alerts.category.met',
  [WeatherAlertCategory.Fire]: 'weather_alerts.category.fire',
  [WeatherAlertCategory.Health]: 'weather_alerts.category.health',
  [WeatherAlertCategory.Env]: 'weather_alerts.category.env',
  [WeatherAlertCategory.Other]: 'weather_alerts.category.other',
};
const URGENCY_KEYS: Record<number, string> = {
  [WeatherAlertUrgency.Immediate]: 'weather_alerts.urgency.immediate',
  [WeatherAlertUrgency.Expected]: 'weather_alerts.urgency.expected',
  [WeatherAlertUrgency.Future]: 'weather_alerts.urgency.future',
  [WeatherAlertUrgency.Past]: 'weather_alerts.urgency.past',
  [WeatherAlertUrgency.Unknown]: 'weather_alerts.urgency.unknown',
};
const CERTAINTY_KEYS: Record<number, string> = {
  [WeatherAlertCertainty.Observed]: 'weather_alerts.certainty.observed',
  [WeatherAlertCertainty.Likely]: 'weather_alerts.certainty.likely',
  [WeatherAlertCertainty.Possible]: 'weather_alerts.certainty.possible',
  [WeatherAlertCertainty.Unlikely]: 'weather_alerts.certainty.unlikely',
  [WeatherAlertCertainty.Unknown]: 'weather_alerts.certainty.unknown',
};
const STATUS_KEYS: Record<number, string> = {
  [WeatherAlertStatus.Active]: 'weather_alerts.status.active',
  [WeatherAlertStatus.Updated]: 'weather_alerts.status.updated',
  [WeatherAlertStatus.Expired]: 'weather_alerts.status.expired',
  [WeatherAlertStatus.Cancelled]: 'weather_alerts.status.cancelled',
};

export const severityKey = (severity: number): string => SEVERITY_KEYS[severity] ?? SEVERITY_KEYS[WeatherAlertSeverity.Unknown];
export const categoryKey = (category: number): string => CATEGORY_KEYS[category] ?? CATEGORY_KEYS[WeatherAlertCategory.Other];
export const urgencyKey = (urgency: number): string => URGENCY_KEYS[urgency] ?? URGENCY_KEYS[WeatherAlertUrgency.Unknown];
export const certaintyKey = (certainty: number): string => CERTAINTY_KEYS[certainty] ?? CERTAINTY_KEYS[WeatherAlertCertainty.Unknown];
export const alertStatusKey = (status: number): string => STATUS_KEYS[status] ?? STATUS_KEYS[WeatherAlertStatus.Active];
export const severityColor = (severity: number): string => SEVERITY_COLORS[severity] ?? SEVERITY_COLORS[WeatherAlertSeverity.Unknown];

export type SeverityTab = 'all' | WeatherAlertSeverity.Extreme | WeatherAlertSeverity.Severe | WeatherAlertSeverity.Moderate | WeatherAlertSeverity.Minor;

export const SEVERITY_TABS: readonly SeverityTab[] = ['all', WeatherAlertSeverity.Extreme, WeatherAlertSeverity.Severe, WeatherAlertSeverity.Moderate, WeatherAlertSeverity.Minor];

/** UTC instants for display: the *On* fields from current servers, else the older display strings (parsed as UTC). */
export const alertTimes = (alert: WeatherAlertResultData): { effective: number | null; onset: number | null; expires: number | null; sent: number | null } => ({
  effective: parseUtcMs(alert.EffectiveOnUtc || alert.EffectiveUtc),
  onset: parseUtcMs(alert.OnsetOnUtc || alert.OnsetUtc),
  expires: parseUtcMs(alert.ExpiresOnUtc || alert.ExpiresUtc),
  sent: parseUtcMs(alert.SentOnUtc || alert.SentUtc),
});

/** The alert's centre ("lat,lng") when it parses, for the map slot. */
export const alertCenter = (alert: Pick<WeatherAlertResultData, 'CenterGeoLocation'>): { latitude: number; longitude: number } | null => {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(alert.CenterGeoLocation ?? '');
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
};
