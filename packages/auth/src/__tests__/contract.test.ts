/**
 * Auth endpoint contract test (omni-plan §7.2, D12), the auth package's counterpart of packages/api's contract test:
 * every definition must exist in Core's v4 Swagger with the same method, path parameters, query names and body encoding.
 * Snapshot: packages/api/contract/swagger-v4.json (refresh with `node packages/api/contract/refresh-swagger.mjs`).
 *
 * OpenIddict endpoints (`connect/token`, `connect/external-token`) are matched case-insensitively and always read a
 * form-urlencoded body, whatever Swagger documents for the controller action behind them.
 */
import { type EndpointDefinition, endpointRegistry, pathParamsOf } from '@resgrid/api';

import swagger from '../../../api/contract/swagger-v4.json';
import { authEndpointRegistry, connectEndpoints, OPENIDDICT_ENDPOINT_PATHS } from '../api/endpoints';

interface SwaggerParameter {
  name: string;
  in: string;
  required?: boolean;
}

interface SwaggerOperation {
  parameters?: SwaggerParameter[];
  requestBody?: { content: Record<string, unknown> };
}

const paths = swagger.paths as unknown as Record<string, Record<string, SwaggerOperation>>;
const PREFIX = '/api/v{VersionId}';
const CONTENT_TYPE: Record<string, string> = { json: 'application/json', multipart: 'multipart/form-data', form: 'application/x-www-form-urlencoded' };

const isOpenIddict = (definition: EndpointDefinition): boolean => OPENIDDICT_ENDPOINT_PATHS.includes(definition.path);

const pathEntryFor = (definition: EndpointDefinition): Record<string, SwaggerOperation> | undefined => {
  const exact = paths[PREFIX + definition.path];
  if (exact || !isOpenIddict(definition)) {
    return exact;
  }
  const key = Object.keys(paths).find((p) => p.toLowerCase() === (PREFIX + definition.path).toLowerCase());
  return key ? paths[key] : undefined;
};

const problemsWith = (definition: EndpointDefinition): string[] => {
  const pathEntry = pathEntryFor(definition);
  if (!pathEntry) {
    return ['path not in Swagger'];
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
      problems.push(`query param "${name}" not in Swagger`);
    }
  }
  for (const [name, parameter] of swaggerQuery) {
    if (parameter.required && !(definition.query ?? []).includes(name)) {
      problems.push(`required query param "${name}" not declared`);
    }
  }
  if (isOpenIddict(definition)) {
    if (definition.body !== 'form') {
      problems.push('OpenIddict endpoints take a form-urlencoded body');
    }
    return problems;
  }
  const content = operation.requestBody?.content;
  if (definition.body) {
    if (!content) {
      problems.push(`sends a ${definition.body} body but Swagger declares none`);
    } else if (!(CONTENT_TYPE[definition.body] in content)) {
      problems.push(`body ${CONTENT_TYPE[definition.body]} not accepted (accepts ${Object.keys(content).join(', ')})`);
    }
  } else if (content) {
    problems.push(`Swagger expects a body (${Object.keys(content).join(', ')}) but the definition sends none`);
  }
  return problems;
};

describe('auth endpoint contract vs Core v4 Swagger', () => {
  it('registers the auth endpoints with unique names, none duplicated in @resgrid/api', () => {
    const names = authEndpointRegistry.map((d) => d.name);
    expect(names.length).toBeGreaterThanOrEqual(50);
    expect(new Set(names).size).toBe(names.length);
    const apiNames = new Set(endpointRegistry.map((d) => d.name));
    expect(names.filter((name) => apiNames.has(name))).toEqual([]);
  });

  it.each(authEndpointRegistry.map((definition) => [definition.name, definition] as const))('%s matches Swagger', (_name, definition) => {
    expect(problemsWith(definition)).toEqual([]);
  });

  it('sends the sign-in transaction calls without a bearer token and the session calls with one', () => {
    const anonymous = authEndpointRegistry.filter((d) => d.anonymous).map((d) => d.path);
    expect(anonymous).toEqual(expect.arrayContaining(['/connect/token', '/Authentication/CompleteTotp', '/Sso/Begin', '/Sso/Redeem', '/MfaApproval/Request', '/AccountSecurity/BeginFactorRecovery']));
    for (const definition of authEndpointRegistry.filter((d) => d.path.startsWith('/sessions') || d.path.startsWith('/Passkeys') || d.path === '/AccountSecurity/Methods')) {
      expect([definition.name, definition.anonymous === true]).toEqual([definition.name, false]);
    }
  });

  it('posts the token grants form-encoded to the exact paths every shipped build uses', () => {
    expect(connectEndpoints.token).toMatchObject({ method: 'POST', path: '/connect/token', body: 'form', anonymous: true });
    expect(connectEndpoints.externalToken).toMatchObject({ method: 'POST', path: '/connect/external-token', body: 'form', anonymous: true });
  });
});
