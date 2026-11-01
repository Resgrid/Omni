import { isPmtilesProtocolRegistered, registerPmtilesProtocol, resetPmtilesProtocolForTests } from '../pmtiles/register-pmtiles.web';
import { configureMapRenderer } from '../rg/renderer-setup.web';
import { addProtocol, getWorkerUrl } from './fakes/maplibre-gl';
import { mockProtocols } from './fakes/pmtiles';

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
    expect(addProtocol).toHaveBeenCalledWith('pmtiles', mockProtocols[0].tile);
    expect(isPmtilesProtocolRegistered()).toBe(true);
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
