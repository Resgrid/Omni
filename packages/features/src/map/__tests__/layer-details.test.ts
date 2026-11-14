import type { ActiveLayerResultData } from '@resgrid/models';

import {
  eventPhaseAt,
  eventPhaseLabelKey,
  featureDetailsOf,
  firstFeatureDetails,
  firstOfflineFeatureHit,
  formatLayerEventDates,
  hasLayerDetails,
  type MapLayerDetailsSource,
  mergeDepartmentLayers,
  normalizeEventPhase,
  plainText,
  toLayerDetails,
} from '../lib/layer-details';

const source = (overrides: Partial<MapLayerDetailsSource> = {}): MapLayerDetailsSource => ({
  Id: 'L1',
  Name: 'Marathon 2026',
  Color: '#ff0000',
  IsOnByDefault: false,
  Description: null,
  EventStartsOnUtc: null,
  EventEndsOnUtc: null,
  EventPhase: 'none',
  Organizer: null,
  ContactName: null,
  ContactPhone: null,
  ContactEmail: null,
  SourceFileName: null,
  ...overrides,
});

const active = (overrides: Partial<ActiveLayerResultData> = {}): ActiveLayerResultData => ({
  Id: 'L1',
  Name: 'Marathon',
  LayerSource: 'maplayer',
  Type: 0,
  Color: '#00ff00',
  IsSearchable: false,
  IsOnByDefault: true,
  ...overrides,
});

const at = (iso: string): number => Date.parse(iso);

/** Intl spacing differs by ICU version (U+202F before AM/PM in newer ones). */
const spaced = (text: string): string => text.replace(/\s/g, ' ');

/** The feature tests' t(): keys verbatim with the interpolation values appended. */
const t = (key: string, values: { start?: string; end?: string }): string => `${key}:${[values.start, values.end].filter((value) => value !== undefined).join('|')}`;

describe('plain text', () => {
  it('trims and normalizes line breaks', () => {
    expect(plainText('  Water point  ')).toBe('Water point');
    expect(plainText('a\r\nb\r\n\r\n\r\n\r\nc')).toBe('a\nb\n\nc');
    expect(plainText(null)).toBe('');
    expect(plainText(undefined)).toBe('');
  });

  it('keeps markup as literal text (it is shown in Text, never rendered)', () => {
    expect(plainText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });
});

describe('event phase', () => {
  it('normalizes Core phases and treats anything else as none', () => {
    expect(normalizeEventPhase(' Active ')).toBe('active');
    expect(normalizeEventPhase('upcoming')).toBe('upcoming');
    expect(normalizeEventPhase('ended')).toBe('ended');
    expect(normalizeEventPhase('later')).toBe('none');
    expect(normalizeEventPhase(undefined)).toBe('none');
  });

  it('follows Core: no start means started, no end means still on, judged at the given time', () => {
    const event = { startsOn: new Date('2026-11-15T08:00:00Z'), endsOn: new Date('2026-11-15T16:00:00Z'), serverPhase: 'upcoming' as const };
    expect(eventPhaseAt(event, at('2026-11-15T07:59:00Z'))).toBe('upcoming');
    expect(eventPhaseAt(event, at('2026-11-15T12:00:00Z'))).toBe('active');
    expect(eventPhaseAt(event, at('2026-11-15T16:01:00Z'))).toBe('ended');
    expect(eventPhaseAt({ ...event, startsOn: null }, at('2020-01-01T00:00:00Z'))).toBe('active');
    expect(eventPhaseAt({ ...event, endsOn: null }, at('2030-01-01T00:00:00Z'))).toBe('active');
  });

  it('uses the server phase only when the dates cannot be read, and none without an event', () => {
    expect(eventPhaseAt({ startsOn: null, endsOn: null, serverPhase: 'ended' }, at('2026-11-15T12:00:00Z'))).toBe('ended');
    expect(eventPhaseAt(null, at('2026-11-15T12:00:00Z'))).toBe('none');
  });

  it('labels every phase but none', () => {
    expect(eventPhaseLabelKey('active')).toBe('maps.layer_info.phase_active');
    expect(eventPhaseLabelKey('upcoming')).toBe('maps.layer_info.phase_upcoming');
    expect(eventPhaseLabelKey('ended')).toBe('maps.layer_info.phase_ended');
    expect(eventPhaseLabelKey('none')).toBeNull();
  });
});

describe('layer details', () => {
  it('reads GetMayLayers fields as trimmed text and parses zone-less UTC dates as UTC', () => {
    const details = toLayerDetails(
      source({
        Description: ' Route with 4 water points ',
        EventStartsOnUtc: '2026-11-15T08:00:00',
        EventEndsOnUtc: '2026-11-15T16:00:00Z',
        EventPhase: 'upcoming',
        Organizer: 'Running Club',
        ContactName: 'An Peeters',
        ContactPhone: '+32 9 123 45 67',
        ContactEmail: 'an@example.org',
        SourceFileName: 'marathon.kml',
      })
    );

    expect(details).toEqual({
      description: 'Route with 4 water points',
      organizer: 'Running Club',
      contactName: 'An Peeters',
      contactPhone: '+32 9 123 45 67',
      contactEmail: 'an@example.org',
      sourceFileName: 'marathon.kml',
      event: { startsOn: new Date('2026-11-15T08:00:00Z'), endsOn: new Date('2026-11-15T16:00:00Z'), serverPhase: 'upcoming' },
    });
    expect(hasLayerDetails(details)).toBe(true);
  });

  it('has no event and no details for a plain drawn layer (older servers send none of the fields)', () => {
    const details = toLayerDetails({ Id: 'L2', Name: 'Districts', Color: '', IsOnByDefault: true });
    expect(details.event).toBeNull();
    expect(hasLayerDetails(details)).toBe(false);
    expect(hasLayerDetails(null)).toBe(false);
  });

  it('formats event dates in the department zone; a one-day event ends with a time only', () => {
    const oneDay = { startsOn: new Date('2026-11-15T08:00:00Z'), endsOn: new Date('2026-11-15T16:00:00Z'), serverPhase: 'none' as const };
    expect(spaced(formatLayerEventDates(oneDay, 'UTC', 'en-US', t))).toBe('maps.layer_info.range:Nov 15, 2026, 8:00 AM|4:00 PM');
    expect(spaced(formatLayerEventDates(oneDay, 'Europe/Brussels', 'en-US', t))).toBe('maps.layer_info.range:Nov 15, 2026, 9:00 AM|5:00 PM');
    const weekend = { ...oneDay, endsOn: new Date('2026-11-16T20:00:00Z') };
    expect(spaced(formatLayerEventDates(weekend, 'UTC', 'en-US', t))).toBe('maps.layer_info.range:Nov 15, 2026, 8:00 AM|Nov 16, 2026, 8:00 PM');
    expect(spaced(formatLayerEventDates({ ...oneDay, endsOn: null }, 'UTC', 'en-US', t))).toBe('maps.layer_info.from:Nov 15, 2026, 8:00 AM');
    expect(spaced(formatLayerEventDates({ ...oneDay, startsOn: null }, 'UTC', 'en-US', t))).toBe('maps.layer_info.until:Nov 15, 2026, 4:00 PM');
    expect(formatLayerEventDates(null, 'UTC', 'en-US', t)).toBe('');
  });
});

describe('merging the layer lists', () => {
  it('lists every GetMayLayers layer in server order, then on-by-default layers only GetAllActiveLayers knows', () => {
    const merged = mergeDepartmentLayers(
      [active({ Id: 'L1' }), active({ Id: 'A9', Name: 'Hydrant zones', Color: '#123456' }), active({ Id: 'R1', LayerSource: 'custommaplayer' })],
      [source({ Id: 'L2', Name: 'Concert', IsOnByDefault: false, EventStartsOnUtc: '2026-12-01T18:00:00Z' }), source({ Id: 'L1', Name: 'Marathon 2026', Color: '' })]
    );

    expect(merged.map((layer) => layer.id)).toEqual(['L2', 'L1', 'A9']);
    expect(merged[0]).toMatchObject({ name: 'Concert', isOnByDefault: false });
    expect(merged[0]?.details?.event?.startsOn).toEqual(new Date('2026-12-01T18:00:00Z'));
    // GetAllActiveLayers says L1 is on (Core counts a running event as on) and fills its blank colour.
    expect(merged[1]).toMatchObject({ name: 'Marathon 2026', color: '#00ff00', isOnByDefault: true });
    expect(merged[2]).toMatchObject({ name: 'Hydrant zones', color: '#123456', isOnByDefault: true, details: null });
  });

  it('works with the active list alone (the full list has not loaded) and skips blank ids', () => {
    expect(mergeDepartmentLayers([active({ Id: '' }), active({ Id: 'L1', Name: '' })], []).map((layer) => [layer.id, layer.name])).toEqual([['L1', 'L1']]);
  });
});

describe('feature details', () => {
  const feature = (properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [3.7, 51.05] }, properties });

  it('reads name, category and description (lowercase or PascalCase) as plain text', () => {
    expect(featureDetailsOf(feature({ name: ' Food truck 3 ', category: 'Vendor', description: 'Fries\r\nCash only' }))).toEqual({ name: 'Food truck 3', category: 'Vendor', description: 'Fries\nCash only' });
    expect(featureDetailsOf(feature({ Name: 'Stop 12', Description: 'Bus stop' }))).toEqual({ name: 'Stop 12', category: '', description: 'Bus stop' });
    expect(featureDetailsOf(feature({ description: 'Only a description' }))).toEqual({ name: '', category: '', description: 'Only a description' });
  });

  it('counts numbers as text and ignores objects (an HTML description wrapper) and other values', () => {
    expect(featureDetailsOf(feature({ name: 12, category: Number.NaN, description: { '@type': 'html', value: '<b>x</b>' } }))).toEqual({ name: '12', category: '', description: '' });
    expect(featureDetailsOf(feature({ name: true, description: ['a'] }))).toBeNull();
  });

  it('keeps markup as literal text (it is shown in Text, never rendered)', () => {
    expect(featureDetailsOf(feature({ name: '<script>alert(1)</script>' }))?.name).toBe('<script>alert(1)</script>');
  });

  it('has nothing to show for a feature without a name or description', () => {
    expect(featureDetailsOf(feature({ category: 'Vendor', color: '#ff0000' }))).toBeNull();
    expect(featureDetailsOf(feature(null))).toBeNull();
    expect(featureDetailsOf(null)).toBeNull();
  });

  it('takes the first feature under the tap that has something to show', () => {
    expect(firstFeatureDetails([feature({ color: '#fff' }), feature({ name: 'Stage A' }), feature({ name: 'Stage B' })])?.name).toBe('Stage A');
    expect(firstFeatureDetails([feature({})])).toBeNull();
  });

  it('reads the layer Core tagged an offline bundle feature with', () => {
    expect(firstOfflineFeatureHit([feature({ layerId: 'L1', layerName: 'No text' }), feature({ layerId: 'L2', layerName: ' Street fair ', name: 'Stage A', category: 'Stage' })])).toEqual({
      name: 'Stage A',
      category: 'Stage',
      description: '',
      layerId: 'L2',
      layerName: 'Street fair',
    });
    expect(firstOfflineFeatureHit([feature({ name: 'Untagged', layerId: { nested: true } })])).toEqual({ name: 'Untagged', category: '', description: '', layerId: '', layerName: '' });
    expect(firstOfflineFeatureHit([])).toBeNull();
  });
});
