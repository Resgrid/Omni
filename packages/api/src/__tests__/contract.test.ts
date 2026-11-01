/**
 * Endpoint contract test (omni-plan §7.2, D12): every endpoint definition must exist in Core's v4 Swagger with the same
 * HTTP method, path parameters, query parameter names and body encoding. Catches the legacy defects in plan §10.2
 * (routes that 404, ids sent as query instead of path, JSON bodies where Core reads the query string).
 *
 * Snapshot: packages/api/contract/swagger-v4.json. Refresh with `node packages/api/contract/refresh-swagger.mjs`
 * (public QA API by default, or pass a Core CI artifact / local file) and review the diff.
 */
import swagger from '../../contract/swagger-v4.json';
import { type EndpointDefinition, pathParamsOf } from '../core/endpoint';
import { getAllCallPriorities, getCurrentStaffing, getMapLayers } from '../endpoints';
import { endpointRegistry } from '../registry';

interface SwaggerParameter {
  name: string;
  in: string;
  required?: boolean;
}

interface SwaggerOperation {
  parameters?: SwaggerParameter[];
  requestBody?: { content: Record<string, unknown>; required?: boolean };
}

const paths = swagger.paths as unknown as Record<string, Record<string, SwaggerOperation>>;
const PREFIX = '/api/v{VersionId}';
const CONTENT_TYPE: Record<string, string> = { json: 'application/json', multipart: 'multipart/form-data', form: 'application/x-www-form-urlencoded' };

const operationFor = (definition: EndpointDefinition): SwaggerOperation | undefined => paths[PREFIX + definition.path]?.[definition.method.toLowerCase()];

/** What a definition says that Swagger contradicts; empty when it matches. */
const problemsWith = (definition: EndpointDefinition): string[] => {
  const pathEntry = paths[PREFIX + definition.path];
  if (!pathEntry) {
    const near = Object.keys(paths).filter((p) => p.toLowerCase() === (PREFIX + definition.path).toLowerCase());
    return [`path not in Swagger${near.length ? ` (case differs: ${near.join(', ')})` : ''}`];
  }
  const operation = pathEntry[definition.method.toLowerCase()];
  if (!operation) {
    return [`method ${definition.method} not in Swagger (has ${Object.keys(pathEntry).join(', ').toUpperCase()})`];
  }
  const problems: string[] = [];
  const parameters = (operation.parameters ?? []).filter((p) => p.name !== 'VersionId');
  const swaggerPath = parameters.filter((p) => p.in === 'path').map((p) => p.name);
  const ourPath = pathParamsOf(definition.path);
  if ([...swaggerPath].sort().join(',') !== [...ourPath].sort().join(',')) {
    problems.push(`path params ${ourPath.join(',') || '-'} != Swagger ${swaggerPath.join(',') || '-'}`);
  }
  const swaggerQuery = new Map(parameters.filter((p) => p.in === 'query').map((p) => [p.name, p]));
  for (const name of definition.query ?? []) {
    if (!swaggerQuery.has(name)) {
      problems.push(`query param "${name}" not in Swagger (has ${[...swaggerQuery.keys()].join(', ') || 'none'})`);
    }
  }
  for (const [name, parameter] of swaggerQuery) {
    if (parameter.required && !(definition.query ?? []).includes(name)) {
      problems.push(`required query param "${name}" not declared`);
    }
  }
  const content = operation.requestBody?.content;
  if (definition.body) {
    if (!content) {
      problems.push(`sends a ${definition.body} body but Swagger declares none`);
    } else if (!(CONTENT_TYPE[definition.body] in content)) {
      problems.push(`body ${CONTENT_TYPE[definition.body]} not accepted (accepts ${Object.keys(content).join(', ')})`);
    }
  } else if (content && definition.path !== '/Connect/token') {
    problems.push(`Swagger expects a body (${Object.keys(content).join(', ')}) but the definition sends none`);
  }
  return problems;
};

describe('endpoint contract vs Core v4 Swagger', () => {
  it('has a usable snapshot', () => {
    expect(Object.keys(paths).length).toBeGreaterThan(500);
  });

  it('gives every definition a unique name', () => {
    const names = endpointRegistry.map((d) => d.name);
    expect(names.length).toBeGreaterThan(400);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(endpointRegistry.map((definition) => [definition.name, definition] as const))('%s matches Swagger', (_name, definition) => {
    expect(problemsWith(definition)).toEqual([]);
  });

  it('never calls the legacy routes Core does not have (plan §10.2)', () => {
    const broken = [
      '/Calendar/GetCalendarItems',
      '/Calendar/GetCalendarItemTypes',
      '/Calendar/GetCalendarItemsForDateRange',
      '/Calendar/SetCalendarAttending',
      '/Shifts/GetAllShifts',
      '/Calls/UpdateCall',
      '/Dispatch/GetSetUnitState',
      '/Mapping/GetMapLayers',
      '/PersonnelStaffing/GetCurrentStatffing',
    ];
    const used = new Set(endpointRegistry.map((d) => d.path));
    expect(broken.filter((path) => used.has(path))).toEqual([]);
  });

  it('keeps Core wire typos behind correctly named functions', () => {
    const byPath = new Map(endpointRegistry.map((d) => [d.path, d.name]));
    expect(byPath.get('/Mapping/GetMayLayers')).toBe('mapping.getMapLayers');
    expect(byPath.get('/CallPriorities/GetAllCallPriorites')).toBe('calls.getAllCallPriorities');
    expect(byPath.get('/PersonnelStaffing/GetCurrentStaffing')).toBe('statuses.getCurrentStaffing');
    expect([getMapLayers, getAllCallPriorities, getCurrentStaffing].every((fn) => typeof fn === 'function')).toBe(true);
  });

  it('sends ids in the path where Core routes them there (Unit sent mapping ids as query)', () => {
    const mapping = endpointRegistry.filter((d) =>
      /\/Mapping\/(GetPoi|GetIndoorMap|GetIndoorMapFloor|GetCustomMap|GetCustomMapLayer|GetMapLayerGeoJSON|GetIndoorMapZonesGeoJSON|GetCustomMapRegionsGeoJSON)\//.test(d.path)
    );
    expect(mapping.length).toBe(8);
    for (const definition of mapping) {
      expect(definition.query ?? []).toEqual([]);
    }
  });

  it('sends ToggleCallTimers arguments as query parameters (only IC was right)', () => {
    const toggle = endpointRegistry.find((d) => d.path === '/CheckInTimers/ToggleCallTimers');
    expect(toggle).toMatchObject({ method: 'PUT', query: ['callId', 'enabled'] });
    expect(toggle?.body).toBeUndefined();
    expect(operationFor(toggle as EndpointDefinition)).toBeDefined();
  });
});
