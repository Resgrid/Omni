import type * as PmtilesModule from '../pmtiles/register-pmtiles.web';
import type * as LoaderModule from '../rg/maplibre-loader.web';
import type * as RendererSetupModule from '../rg/renderer-setup.web';
import type * as FakeMapLibre from './fakes/maplibre-gl';

// maplibre-gl loads with the first map (a separate chunk in the web export). Every test starts from a fresh module
// registry, so maplibre-gl is not loaded yet; the loader's deferred require() resolves in that same registry.

/* eslint-disable @typescript-eslint/no-require-imports -- a fresh module registry needs require() */
const load = () => ({
  loader: require('../rg/maplibre-loader.web') as typeof LoaderModule,
  fake: require('./fakes/maplibre-gl') as typeof FakeMapLibre,
  renderer: require('../rg/renderer-setup.web') as typeof RendererSetupModule,
  pmtiles: require('../pmtiles/register-pmtiles.web') as typeof PmtilesModule,
});
/* eslint-enable @typescript-eslint/no-require-imports */

describe('maplibre-gl loader (web / Electron)', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('queues setup until maplibre-gl loads, loads it once and runs later setup immediately', async () => {
    const { loader, fake } = load();
    const setup = jest.fn();
    loader.withMapLibre(setup);
    expect(loader.getLoadedMapLibre()).toBeNull();
    expect(setup).not.toHaveBeenCalled();

    const [first, second] = await Promise.all([loader.loadMapLibre(), loader.loadMapLibre()]);
    expect(first).toBe(second);
    expect(first.Map).toBe(fake.Map);
    expect(setup).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledWith(first);
    expect(loader.getLoadedMapLibre()).toBe(first);

    const later = jest.fn();
    loader.withMapLibre(later);
    expect(later).toHaveBeenCalledWith(first);
  });

  it('applies the worker URL and the pmtiles protocol when maplibre-gl loads', async () => {
    const { loader, fake, renderer, pmtiles } = load();
    renderer.configureMapRenderer({ workerUrl: '/maplibre-gl-worker.js' });
    pmtiles.registerPmtilesProtocol();
    expect(pmtiles.isPmtilesProtocolRegistered()).toBe(true);
    expect(fake.getWorkerUrl()).toBe('');
    expect(fake.addProtocol).not.toHaveBeenCalled();

    await loader.loadMapLibre();
    expect(fake.getWorkerUrl()).toBe('/maplibre-gl-worker.js');
    expect(fake.addProtocol).toHaveBeenCalledTimes(1);
    expect(fake.addProtocol).toHaveBeenCalledWith('pmtiles', expect.any(Function));
  });
});
