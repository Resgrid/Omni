// Stand-in for maplibre-gl (mapped in jest.web.config.js): records sources, layers, controls, images and camera calls,
// and lets tests fire map events (`load`, `style.load`, `click`).

type Listener = (event: any) => void;

class Emitter {
  private listeners = new Map<string, Set<Listener>>();
  on(type: string, listener: Listener): this {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
    return this;
  }
  off(type: string, listener: Listener): this {
    this.listeners.get(type)?.delete(listener);
    return this;
  }
  once(type: string, listener: Listener): this {
    const wrapped: Listener = (event) => {
      this.off(type, wrapped);
      listener(event);
    };
    return this.on(type, wrapped);
  }
  emit(type: string, event: any = {}): void {
    for (const listener of Array.from(this.listeners.get(type) ?? [])) listener(event);
  }
}

const handler = () => ({ enabled: true, enable: jest.fn(), disable: jest.fn() });

export const mockMaps: FakeMap[] = [];
export const mockCalls: { addSource: string[]; addLayer: { id: string; spec: any; beforeId?: string }[]; setStyle: any[] } = { addSource: [], addLayer: [], setStyle: [] };

export const resetMaplibreGlFakes = (): void => {
  mockMaps.length = 0;
  mockCalls.addSource.length = 0;
  mockCalls.addLayer.length = 0;
  mockCalls.setStyle.length = 0;
  mockMarkers.length = 0;
  addProtocol.mockClear();
  workerUrl = '';
};

export class FakeMap extends Emitter {
  options: any;
  sources = new Map<string, any>();
  layers: any[] = [];
  images = new Map<string, any>();
  controls: { control: any; position?: string }[] = [];
  camera: { method: string; args: unknown[] }[] = [];
  removed = false;
  dragPan = handler();
  scrollZoom = handler();
  doubleClickZoom = handler();
  boxZoom = handler();
  keyboard = handler();
  dragRotate = handler();
  touchZoomRotate = handler();
  touchPitch = handler();

  constructor(options: any) {
    super();
    this.options = options;
    mockMaps.push(this);
  }

  addSource(id: string, spec: any): void {
    if (this.sources.has(id)) throw new Error(`Source ${id} already exists`);
    mockCalls.addSource.push(id);
    const source = { ...spec, setData: jest.fn(), updateImage: jest.fn() };
    this.sources.set(id, source);
  }
  getSource(id: string): any {
    return this.sources.get(id);
  }
  removeSource(id: string): void {
    this.sources.delete(id);
  }
  addLayer(spec: any, beforeId?: string): void {
    if (spec.source && !this.sources.has(spec.source)) throw new Error(`Source ${spec.source} missing`);
    mockCalls.addLayer.push({ id: spec.id, spec, beforeId });
    this.layers.push(spec);
  }
  getLayer(id: string): any {
    return this.layers.find((layer) => layer.id === id);
  }
  removeLayer(id: string): void {
    this.layers = this.layers.filter((layer) => layer.id !== id);
  }
  getStyle(): any {
    return { layers: this.layers };
  }
  setPaintProperty = jest.fn();
  setLayoutProperty = jest.fn();
  setFilter = jest.fn();
  setLayerZoomRange = jest.fn();
  setMinZoom = jest.fn();
  setMaxZoom = jest.fn();
  setMaxBounds = jest.fn();
  /** A full style rebuild drops every source and layer, like maplibre-gl. */
  setStyle(style: any, options?: any): void {
    mockCalls.setStyle.push({ style, options });
    this.sources.clear();
    this.layers = [];
    this.images.clear();
  }
  addControl(control: any, position?: string): void {
    this.controls.push({ control, position });
  }
  removeControl(control: any): void {
    this.controls = this.controls.filter((entry) => entry.control !== control);
  }
  hasImage(name: string): boolean {
    return this.images.has(name);
  }
  addImage(name: string, image: any, options?: any): void {
    this.images.set(name, { image, options });
  }
  removeImage(name: string): void {
    this.images.delete(name);
  }
  getCenter() {
    return { lng: 1, lat: 2 };
  }
  getZoom() {
    return 10;
  }
  getBearing() {
    return 0;
  }
  getPitch() {
    return 0;
  }
  getBounds() {
    return { getWest: () => 0, getSouth: () => 1, getEast: () => 2, getNorth: () => 3 };
  }
  jumpTo(...args: unknown[]) {
    this.camera.push({ method: 'jumpTo', args });
  }
  easeTo(...args: unknown[]) {
    this.camera.push({ method: 'easeTo', args });
  }
  flyTo(...args: unknown[]) {
    this.camera.push({ method: 'flyTo', args });
  }
  fitBounds(...args: unknown[]) {
    this.camera.push({ method: 'fitBounds', args });
  }
  zoomTo(...args: unknown[]) {
    this.camera.push({ method: 'zoomTo', args });
  }
  queryRenderedFeatures = jest.fn(() => [] as any[]);
  resize = jest.fn();
  remove(): void {
    this.removed = true;
  }
}

export { FakeMap as Map };

export class AttributionControl {
  constructor(public options: any) {}
}

export class NavigationControl {
  constructor(public options: any) {}
}

export class GeolocateControl extends Emitter {
  trigger = jest.fn();
  constructor(public options: any) {
    super();
  }
}

export const mockMarkers: Marker[] = [];

export class Marker {
  lngLat: unknown = null;
  map: FakeMap | null = null;
  constructor(public options: any) {
    mockMarkers.push(this);
  }
  setLngLat(lngLat: unknown): this {
    this.lngLat = lngLat;
    return this;
  }
  addTo(map: FakeMap): this {
    this.map = map;
    return this;
  }
  remove(): void {
    this.map = null;
  }
}

export const addProtocol = jest.fn();
let workerUrl = '';
export const setWorkerUrl = (value: string): void => {
  workerUrl = value;
};
export const getWorkerUrl = (): string => workerUrl;
