import { formatInTimeZone, parseApiUtcDate, toZonedWallClock } from '@resgrid/core/utils/dates';
import type { ActiveLayerResultData, GetMapLayersData } from '@resgrid/models';
import { z } from 'zod';

/**
 * Department map layer details (`Mapping/GetMayLayers`): description, event dates, organizer and contact for layers
 * imported from KML / KMZ / GeoJSON (marathons, concerts, street events), and the name / category / description each
 * imported feature carries. Everything here is plain text: the map shows it in `Text`, never as HTML.
 */

export type LayerEventPhase = 'none' | 'upcoming' | 'active' | 'ended';

/** The GetMayLayers fields the map reads (the store keeps them without the geometry). */
export type MapLayerDetailsSource = Pick<
  GetMapLayersData,
  'Id' | 'Name' | 'Color' | 'IsOnByDefault' | 'Description' | 'EventStartsOnUtc' | 'EventEndsOnUtc' | 'EventPhase' | 'Organizer' | 'ContactName' | 'ContactPhone' | 'ContactEmail' | 'SourceFileName'
>;

export interface LayerEvent {
  startsOn: Date | null;
  endsOn: Date | null;
  /** Core's phase when the list was fetched; used only when the dates cannot be read. */
  serverPhase: LayerEventPhase;
}

export interface LayerDetails {
  description: string;
  organizer: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  sourceFileName: string;
  /** Null for a layer that is not tied to an event. */
  event: LayerEvent | null;
}

/** One department layer as the map lists it: GetMayLayers merged with GetAllActiveLayers. */
export interface MergedDepartmentLayer {
  id: string;
  name: string;
  color: string;
  isOnByDefault: boolean;
  details: LayerDetails | null;
}

const PHASES: readonly LayerEventPhase[] = ['none', 'upcoming', 'active', 'ended'];

/** Trimmed text with line breaks normalized (CRLF to LF, at most one blank line in a row). */
export const plainText = (value: string | null | undefined): string =>
  (value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const normalizeEventPhase = (value: string | null | undefined): LayerEventPhase => {
  const phase = (value ?? '').trim().toLowerCase();

  return PHASES.find((known) => known === phase) ?? 'none';
};

/** Core's rule (MapLayerEvents.GetPhase): no start = already started, no end = still on. */
export const eventPhaseAt = (event: LayerEvent | null | undefined, now: number): LayerEventPhase => {
  if (!event) return 'none';

  if (!event.startsOn && !event.endsOn) return event.serverPhase;

  if (event.startsOn && now < event.startsOn.getTime()) return 'upcoming';

  if (event.endsOn && now > event.endsOn.getTime()) return 'ended';

  return 'active';
};

export const toLayerDetails = (source: MapLayerDetailsSource): LayerDetails => {
  const startsOn = parseApiUtcDate(source.EventStartsOnUtc);
  const endsOn = parseApiUtcDate(source.EventEndsOnUtc);
  const serverPhase = normalizeEventPhase(source.EventPhase);

  return {
    description: plainText(source.Description),
    organizer: plainText(source.Organizer),
    contactName: plainText(source.ContactName),
    contactPhone: plainText(source.ContactPhone),
    contactEmail: plainText(source.ContactEmail),
    sourceFileName: plainText(source.SourceFileName),
    event: startsOn || endsOn || serverPhase !== 'none' ? { startsOn, endsOn, serverPhase } : null,
  };
};

/** Whether the layer has anything for its details sheet. */
export const hasLayerDetails = (details: LayerDetails | null | undefined): details is LayerDetails =>
  !!details && (!!details.event || !!details.description || !!details.organizer || !!details.contactName || !!details.contactPhone || !!details.contactEmail || !!details.sourceFileName);

/**
 * The layers the map lists: every layer GetMayLayers returns (server order), then any on-by-default layer only
 * GetAllActiveLayers knows (the list has not loaded yet, or failed). Custom-map region layers are left to the custom
 * maps screens. A layer starts on when either list says so (Core already counts an event layer as on while it runs).
 */
export const mergeDepartmentLayers = (activeLayers: readonly ActiveLayerResultData[], mapLayers: readonly MapLayerDetailsSource[]): MergedDepartmentLayer[] => {
  const active = new Map<string, ActiveLayerResultData>();

  for (const layer of activeLayers) {
    if (layer.Id && layer.LayerSource?.toLowerCase() !== 'custommaplayer') active.set(layer.Id, layer);
  }

  const merged: MergedDepartmentLayer[] = [];
  const seen = new Set<string>();

  for (const layer of mapLayers) {
    if (!layer.Id || seen.has(layer.Id)) continue;
    seen.add(layer.Id);
    const summary = active.get(layer.Id);

    merged.push({
      id: layer.Id,
      name: layer.Name || summary?.Name || layer.Id,
      color: layer.Color || summary?.Color || '',
      isOnByDefault: layer.IsOnByDefault === true || summary?.IsOnByDefault === true,
      details: toLayerDetails(layer),
    });
  }

  for (const layer of active.values()) {
    if (seen.has(layer.Id)) continue;
    merged.push({ id: layer.Id, name: layer.Name || layer.Id, color: layer.Color || '', isOnByDefault: layer.IsOnByDefault === true, details: null });
  }

  return merged;
};

/** The translator the date range needs (i18next's `t`). */
export type EventDatesTranslate = (key: string, values: { start?: string; end?: string }) => string;

const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
const TIME_ONLY: Intl.DateTimeFormatOptions = { timeStyle: 'short' };

const sameLocalDay = (a: Date, b: Date, timeZone: string | null): boolean => {
  const left = toZonedWallClock(a, timeZone);
  const right = toZonedWallClock(b, timeZone);

  return left.year === right.year && left.month === right.month && left.day === right.day;
};

/** "Nov 15, 2026, 9:00 AM – 5:00 PM" in the department's zone (one-day events show the end as a time); '' without dates. */
export const formatLayerEventDates = (event: LayerEvent | null | undefined, timeZone: string | null, locale: string | undefined, t: EventDatesTranslate): string => {
  if (!event) return '';
  const start = event.startsOn ? formatInTimeZone(event.startsOn, timeZone, DATE_TIME, locale) : '';

  if (event.startsOn && event.endsOn) {
    const end = formatInTimeZone(event.endsOn, timeZone, sameLocalDay(event.startsOn, event.endsOn, timeZone) ? TIME_ONLY : DATE_TIME, locale);

    return start && end ? t('maps.layer_info.range', { start, end }) : start || end;
  }

  if (start) return t('maps.layer_info.from', { start });
  const end = event.endsOn ? formatInTimeZone(event.endsOn, timeZone, DATE_TIME, locale) : '';

  return end ? t('maps.layer_info.until', { end }) : '';
};

/** The badge label for an event's phase, or null when there is nothing to badge. */
export const eventPhaseLabelKey = (phase: LayerEventPhase): string | null => (phase === 'none' ? null : `maps.layer_info.phase_${phase}`);

// ---- features -----------------------------------------------------------------------------------------------------

export interface LayerFeatureDetails {
  name: string;
  category: string;
  description: string;
}

/** A feature property as text: a string, or a number (a stop numbered 12); objects (HTML wrappers) and the rest are none. */
const propertyText = z
  .union([z.string(), z.number().transform(String)])
  .optional()
  .catch(undefined);

/** The text properties imported features carry (Core writes lowercase; older GeoJSON may use PascalCase). */
const featureTextSchema = z.object({
  name: propertyText,
  Name: propertyText,
  category: propertyText,
  Category: propertyText,
  description: propertyText,
  Description: propertyText,
});

/** A tapped feature's name, category and description (plain text), or null when it has neither a name nor a description. */
export const featureDetailsOf = (feature: GeoJSON.Feature | null | undefined): LayerFeatureDetails | null => {
  const parsed = featureTextSchema.safeParse(feature?.properties);

  if (!parsed.success) return null;
  const text = parsed.data;
  const name = plainText(text.name) || plainText(text.Name);
  const description = plainText(text.description) || plainText(text.Description);

  if (!name && !description) return null;

  return { name, category: plainText(text.category) || plainText(text.Category), description };
};

/** The first feature under a tap that has something to show (a tap can hit several overlapping features). */
export const firstFeatureDetails = (features: readonly (GeoJSON.Feature | null | undefined)[]): LayerFeatureDetails | null => {
  for (const feature of features) {
    const details = featureDetailsOf(feature);

    if (details) return details;
  }

  return null;
};

/** A tapped feature of the offline department data, with the layer Core tagged it with. */
export interface OfflineLayerFeatureHit extends LayerFeatureDetails {
  layerId: string;
  /** The layer's name when the bundle was made (the live list's name is preferred when the layer is known). */
  layerName: string;
}

/** The layer tags Core adds to every feature of the offline bundle's `layers` section. */
const offlineLayerTagSchema = z.object({ layerId: propertyText, layerName: propertyText });

/** The first offline layer feature under a tap that has something to show, with its layer; null when there is none. */
export const firstOfflineFeatureHit = (features: readonly (GeoJSON.Feature | null | undefined)[]): OfflineLayerFeatureHit | null => {
  for (const feature of features) {
    const details = featureDetailsOf(feature);

    if (!details) continue;
    const tags = offlineLayerTagSchema.safeParse(feature?.properties);

    return { ...details, layerId: tags.success ? plainText(tags.data.layerId) : '', layerName: tags.success ? plainText(tags.data.layerName) : '' };
  }

  return null;
};
