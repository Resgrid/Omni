// Stand-in for pmtiles (mapped in jest.web.config.js): counts Protocol instances.
export const mockProtocols: Protocol[] = [];

export class Protocol {
  tile = jest.fn();
  add = jest.fn();
  constructor(public options?: unknown) {
    mockProtocols.push(this);
  }
}

export class PMTiles {}
