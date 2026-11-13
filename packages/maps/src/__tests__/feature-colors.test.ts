import { isMapColor, RESOLVED_COLOR_PROPERTY, toMapColor, withCheckedLayerColors, withResolvedFeatureColors } from '../lib/feature-colors';

const point = (properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [3.7, 51.05] }, properties });

describe('map colours', () => {
  it('accepts hex and rgb / hsl colours and refuses everything MapLibre may not read', () => {
    for (const value of ['#f00', '#ff0000', '#FF000080', '#f008', ' #12ab9f ', 'rgb(255, 0, 0)', 'rgba(255,0,0,0.5)', 'hsl(120, 50%, 40%)', 'rgb(255 0 0 / 50%)']) expect(isMapColor(value)).toBe(true);

    for (const value of ['', '   ', 'red', '#ff000', '#gg0000', 'ff0000', 'url(javascript:x)', 'rgb(1,2)', null, undefined]) expect(isMapColor(value)).toBe(false);
    expect(toMapColor(' #12ab9f ')).toBe('#12ab9f');
    expect(toMapColor('nope')).toBeNull();
  });
});

describe('per-shape colours', () => {
  it('gives each shape its own readable colour, else the fallback, without changing the input', () => {
    const input: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [point({ name: 'Food truck', color: '#00ff00' }), point({ name: 'Stage', Color: 'rgb(0, 0, 255)' }), point({ name: 'Bad', color: 'chartreuse-ish' }), point({ name: 'Number', color: 12 }), point(null)],
    };

    const resolved = withResolvedFeatureColors(input, '#ff0000');
    expect(resolved.features.map((feature) => feature.properties?.[RESOLVED_COLOR_PROPERTY])).toEqual(['#00ff00', 'rgb(0, 0, 255)', '#ff0000', '#ff0000', '#ff0000']);
    expect(resolved.features[0]?.properties).toMatchObject({ name: 'Food truck', color: '#00ff00' });
    expect(input.features[0]?.properties).not.toHaveProperty(RESOLVED_COLOR_PROPERTY);
    expect(input.features[4]?.properties).toBeNull();
  });

  it('passes empty and missing collections through', () => {
    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    expect(withResolvedFeatureColors(empty, '#ff0000')).toBe(empty);
    expect(withResolvedFeatureColors(null, '#ff0000')).toBeNull();
    expect(withResolvedFeatureColors(undefined, '#ff0000')).toBeUndefined();
  });
});

describe('offline bundle layer colours', () => {
  it('checks each feature’s own colour, then its layer’s, and leaves the rest to the theme', () => {
    const input: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        point({ name: 'Food truck', color: '#00ff00', layerColor: '#ff0000' }),
        point({ name: 'Stage', color: 'not-a-colour', layerColor: '#ff0000' }),
        point({ name: 'Gate', color: '', layerColor: 'rgb(0, 0, 255)' }),
        point({ name: 'Bad both', color: 12, layerColor: 'blue-ish' }),
        point(null),
      ],
    };

    const checked = withCheckedLayerColors(input);

    expect(checked.features.map((feature) => feature.properties?.[RESOLVED_COLOR_PROPERTY])).toEqual(['#00ff00', '#ff0000', 'rgb(0, 0, 255)', undefined, undefined]);
    expect(checked.features[0]?.properties).toMatchObject({ name: 'Food truck', color: '#00ff00', layerColor: '#ff0000' });
    expect(input.features[0]?.properties).not.toHaveProperty(RESOLVED_COLOR_PROPERTY);
  });

  it('never trusts an rgColor the bundle sends', () => {
    const checked = withCheckedLayerColors({ type: 'FeatureCollection', features: [point({ rgColor: 'url(javascript:x)' }), point({ rgColor: 'red', layerColor: '#123456' })] });

    expect(checked.features[0]?.properties).not.toHaveProperty(RESOLVED_COLOR_PROPERTY);
    expect(checked.features[1]?.properties?.[RESOLVED_COLOR_PROPERTY]).toBe('#123456');
  });
});
