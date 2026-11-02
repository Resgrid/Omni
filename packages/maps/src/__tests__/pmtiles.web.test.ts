import { isPmtilesProtocolRegistered, registerPmtilesProtocol, resetPmtilesProtocolForTests } from '../pmtiles/register-pmtiles.web';
import { loadMapLibre } from '../rg/maplibre-loader.web';
import { configureMapRenderer } from '../rg/renderer-setup.web';
import { addProtocol, getWorkerUrl } from './fakes/maplibre-gl';
import { mockProtocols } from './fakes/pmtiles';

// maplibre-gl loaded up front: setup applies immediately (maplibre-loader.web.test.ts covers setup before the load).
beforeAll(async () => {
  await loadMapLibre();
});

describe('registerPmtilesProtocol (web / Electron)', () => {
  beforeEach(() => {
    resetPmtilesProtocolForTests();
    addProtocol.mockClear();
    mockProtocols.length = 0;
  });

  it('registers the pmtiles protocol with maplibre-gl once and returns the same handle afterwards', () => {
    expect(isPmtilesProtocolRegistered()).toBe(false);
    const first = registerPmtilesProtocol();
    const second = registerPmtilesProtocol();
    expect(first).toBe(second);
    expect(mockProtocols).toHaveLength(1);
    expect(addProtocol).toHaveBeenCalledTimes(1);
    expect(addProtocol).toHaveBeenCalledWith('pmtiles', expect.any(Function));
    expect(isPmtilesProtocolRegistered()).toBe(true);
  });

  it('answers maplibre-gl’s pmtiles requests through the protocol instance', () => {
    registerPmtilesProtocol();
    const handler = addProtocol.mock.calls[0][1] as (params: { url: string }, abortController: AbortController) => unknown;
    const params = { url: 'pmtiles://https://maps.example.org/area.pmtiles/3/4/5' };
    const abortController = new AbortController();
    mockProtocols[0].tile.mockReturnValue('tile-response');
    expect(handler(params, abortController)).toBe('tile-response');
    expect(mockProtocols[0].tile).toHaveBeenCalledWith(params, abortController);
    // Without a local pack reader nothing is added: remote archives load by range requests.
    expect(mockProtocols[0].add).not.toHaveBeenCalled();
  });
});

describe('configureMapRenderer (web)', () => {
  it('points maplibre-gl at the served worker script', () => {
    configureMapRenderer({ workerUrl: '/maplibre-gl-worker.mjs' });
    expect(getWorkerUrl()).toBe('/maplibre-gl-worker.mjs');
    configureMapRenderer({ workerUrl: null });
    expect(getWorkerUrl()).toBe('/maplibre-gl-worker.mjs');
  });
});
