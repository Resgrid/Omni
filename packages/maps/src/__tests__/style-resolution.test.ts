import { isPublicMapboxToken, mapboxStyleFetchUrl, parseMapboxStyleUrl, rewriteMapboxUrl, transformMapboxStyle } from '../provider/mapbox-compat';
import { buildRasterStyle, DEFAULT_RASTER_ATTRIBUTION, FALLBACK_MAPBOX_DAY_STYLE, FALLBACK_MAPBOX_NIGHT_STYLE, resolveMapStyleSource } from '../provider/style-resolution';

const TOKEN = 'pk.eyJ1IjoicmVzZ3JpZCJ9.abc_DEF-123';

describe('resolveMapStyleSource', () => {
  it('uses MapLibreStyleUrlDay / Night when the server provides them, by theme', () => {
    const config = {
      MapLibreStyleUrlDay: 'https://api.resgrid.com/api/v4/Mapping/GetStyle/day.json?sig=1',
      MapLibreStyleUrlNight: 'https://api.resgrid.com/api/v4/Mapping/GetStyle/night.json?sig=2',
      AppMapboxAccessToken: TOKEN,
      MapDayStyleUrl: 'mapbox://styles/mapbox/streets-v12',
    };
    expect(resolveMapStyleSource(config, 'light')).toEqual({ kind: 'maplibre', url: config.MapLibreStyleUrlDay, attribution: '' });
    expect(resolveMapStyleSource(config, 'dark')).toEqual({ kind: 'maplibre', url: config.MapLibreStyleUrlNight, attribution: '' });
  });

  it('falls back to the other theme when one MapLibre URL is missing', () => {
    const config = { MapLibreStyleUrlDay: 'https://maps.example.org/day.json' };
    expect(resolveMapStyleSource(config, 'dark')).toMatchObject({ kind: 'maplibre', url: 'https://maps.example.org/day.json' });
  });

  it('ignores non-https MapLibre URLs (http only to localhost in development)', () => {
    expect(resolveMapStyleSource({ MapLibreStyleUrlDay: 'http://maps.example.org/day.json' }, 'light', false).kind).toBe('none');
    expect(resolveMapStyleSource({ MapLibreStyleUrlDay: 'http://localhost:8080/day.json' }, 'light', true)).toMatchObject({ kind: 'maplibre' });
  });

  it('derives a Mapbox source from MapDayStyleUrl / MapNightStyleUrl + AppMapboxAccessToken on older servers', () => {
    const config = { MapDayStyleUrl: 'mapbox://styles/acme/day-style', MapNightStyleUrl: 'mapbox://styles/acme/night-style', AppMapboxAccessToken: TOKEN };
    const day = resolveMapStyleSource(config, 'light');
    expect(day).toMatchObject({ kind: 'mapbox', styleUrl: 'mapbox://styles/acme/day-style', token: TOKEN, fetchUrl: `https://api.mapbox.com/styles/v1/acme/day-style?access_token=${encodeURIComponent(TOKEN)}` });
    expect(resolveMapStyleSource(config, 'dark')).toMatchObject({ kind: 'mapbox', styleUrl: 'mapbox://styles/acme/night-style' });
  });

  it('uses Mapbox Streets / Dark when a token is present but no style is configured', () => {
    expect(resolveMapStyleSource({ AppMapboxAccessToken: TOKEN }, 'light')).toMatchObject({ kind: 'mapbox', styleUrl: FALLBACK_MAPBOX_DAY_STYLE });
    expect(resolveMapStyleSource({ MapAccessToken: TOKEN }, 'dark')).toMatchObject({ kind: 'mapbox', styleUrl: FALLBACK_MAPBOX_NIGHT_STYLE });
  });

  it('never uses a secret (sk.) token', () => {
    expect(isPublicMapboxToken('sk.eyJ1Ijoic2VjcmV0In0.abc')).toBe(false);
    expect(resolveMapStyleSource({ MapDayStyleUrl: 'mapbox://styles/acme/day', AppMapboxAccessToken: 'sk.eyJ1Ijoic2VjcmV0In0.abc' }, 'light').kind).toBe('none');
  });

  it('falls back to a raster style from MapUrl for self-hosted tile servers', () => {
    const source = resolveMapStyleSource({ MapProvider: 'leaflet', MapUrl: 'https://tiles.example.org/{z}/{x}/{y}.png', MapAttribution: '© Example' }, 'light');
    expect(source).toEqual({ kind: 'raster', tileUrl: 'https://tiles.example.org/{z}/{x}/{y}.png', tileSize: 256, attribution: '© Example' });
    const style = buildRasterStyle(source.kind === 'raster' ? source : { kind: 'raster', tileUrl: '', tileSize: 256, attribution: '' });
    expect(style.sources['resgrid-raster']).toMatchObject({ type: 'raster', tiles: ['https://tiles.example.org/{z}/{x}/{y}.png'], attribution: '© Example' });
    expect(style.layers).toHaveLength(1);
  });

  it('prefers MapRasterTileUrl, defaults the raster attribution to OpenStreetMap and keeps the raster as the Mapbox fallback', () => {
    expect(resolveMapStyleSource({ MapRasterTileUrl: 'https://r.example.org/{z}/{x}/{y}.png', MapUrl: 'https://other/{z}/{x}/{y}.png' }, 'light')).toMatchObject({
      tileUrl: 'https://r.example.org/{z}/{x}/{y}.png',
      attribution: DEFAULT_RASTER_ATTRIBUTION,
    });
    const mapbox = resolveMapStyleSource({ AppMapboxAccessToken: TOKEN, MapUrl: 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=x' }, 'light');
    expect(mapbox.kind === 'mapbox' ? mapbox.rasterFallback?.tileUrl : null).toContain('/tiles/256/{z}/{x}/{y}@2x');
  });

  it('returns none (maps hidden) when nothing usable is configured', () => {
    expect(resolveMapStyleSource(null, 'light')).toEqual({ kind: 'none', attribution: '' });
    expect(resolveMapStyleSource({ MapUrl: 'https://tiles.example.org/no-placeholders.png', MapDayStyleUrl: 'mapbox://styles/a/b' }, 'dark').kind).toBe('none');
  });
});

describe('Mapbox → MapLibre rewrite (§8.3)', () => {
  it('parses mapbox:// and api.mapbox.com style URLs', () => {
    expect(parseMapboxStyleUrl('mapbox://styles/mapbox/streets-v12')).toEqual({ owner: 'mapbox', id: 'streets-v12' });
    expect(parseMapboxStyleUrl('https://api.mapbox.com/styles/v1/acme/abc123?fresh=true')).toEqual({ owner: 'acme', id: 'abc123' });
    expect(parseMapboxStyleUrl('https://example.org/style.json')).toBeNull();
    expect(mapboxStyleFetchUrl('mapbox://styles/mapbox/dark-v11', TOKEN)).toBe(`https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=${encodeURIComponent(TOKEN)}`);
  });

  it('rewrites each resource kind with the token', () => {
    const t = encodeURIComponent(TOKEN);
    expect(rewriteMapboxUrl('mapbox://mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2', TOKEN, 'source')).toBe(
      `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2.json?secure&access_token=${t}`
    );
    expect(rewriteMapboxUrl('mapbox://sprites/mapbox/streets-v12', TOKEN, 'sprite')).toBe(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/sprite?access_token=${t}`);
    expect(rewriteMapboxUrl('mapbox://fonts/mapbox/{fontstack}/{range}.pbf', TOKEN, 'glyphs')).toBe(`https://api.mapbox.com/fonts/v1/mapbox/{fontstack}/{range}.pbf?access_token=${t}`);
    expect(rewriteMapboxUrl('mapbox://tiles/acme.tileset/{z}/{x}/{y}', TOKEN, 'tiles')).toBe(`https://api.mapbox.com/v4/acme.tileset/{z}/{x}/{y}?access_token=${t}`);
    expect(rewriteMapboxUrl('https://api.mapbox.com/v4/x.json?secure', TOKEN, 'source')).toBe(`https://api.mapbox.com/v4/x.json?secure&access_token=${t}`);
    expect(rewriteMapboxUrl('https://tiles.example.org/x.json', TOKEN, 'source')).toBe('https://tiles.example.org/x.json');
  });

  it('transforms a Mapbox style: sources, sprite and glyphs rewritten, Mapbox-only parts stripped, attribution injected', () => {
    const style = transformMapboxStyle(
      {
        version: 8,
        name: 'Streets',
        owner: 'mapbox',
        fog: { range: [1, 2] },
        projection: { name: 'globe' },
        imports: [],
        sprite: 'mapbox://sprites/mapbox/streets-v12',
        glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
        sources: {
          composite: { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' },
          satellite: { type: 'raster', url: 'mapbox://mapbox.satellite', attribution: 'Own' },
          model: { type: 'batched-model', url: 'mapbox://x' },
        },
        layers: [
          { id: 'land', type: 'background', paint: { 'background-color': '#fff' } },
          { id: 'roads', type: 'line', source: 'composite', 'source-layer': 'road', slot: 'middle', paint: { 'line-color': '#000', 'line-emissive-strength': 1, 'line-z-offset': 2 }, layout: { 'line-cap': 'round' } },
          { id: 'sky', type: 'sky' },
          { id: 'models', type: 'model', source: 'model' },
          { id: 'orphan', type: 'fill', source: 'model' },
        ],
      },
      TOKEN,
      '© Mapbox © OpenStreetMap'
    ) as unknown as Record<string, any>;
    const t = encodeURIComponent(TOKEN);
    expect(style.version).toBe(8);
    expect(style.fog).toBeUndefined();
    expect(style.projection).toBeUndefined();
    expect(style.imports).toBeUndefined();
    expect(style.owner).toBeUndefined();
    expect(style.sprite).toBe(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/sprite?access_token=${t}`);
    expect(style.glyphs).toBe(`https://api.mapbox.com/fonts/v1/mapbox/{fontstack}/{range}.pbf?access_token=${t}`);
    expect(style.sources.composite).toEqual({ type: 'vector', url: `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8.json?secure&access_token=${t}`, attribution: '© Mapbox © OpenStreetMap' });
    expect(style.sources.satellite.attribution).toBe('Own');
    expect(style.sources.model).toBeUndefined();
    expect(style.layers.map((layer: { id: string }) => layer.id)).toEqual(['land', 'roads']);
    expect(style.layers[1].slot).toBeUndefined();
    expect(style.layers[1].paint).toEqual({ 'line-color': '#000' });
    expect(style.layers[1].layout).toEqual({ 'line-cap': 'round' });
    expect(JSON.stringify(style)).not.toContain('mapbox://');
  });

  it('rewrites multi-sprite arrays and rejects non-objects', () => {
    const style = transformMapboxStyle({ sprite: [{ id: 'default', url: 'mapbox://sprites/acme/x' }], sources: {}, layers: [] }, TOKEN, '') as unknown as { sprite: { url: string }[] };
    expect(style.sprite[0].url).toContain('https://api.mapbox.com/styles/v1/acme/x/sprite?access_token=');
    expect(() => transformMapboxStyle('nope', TOKEN, '')).toThrow();
  });
});
