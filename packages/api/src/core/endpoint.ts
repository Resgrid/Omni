export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** How the request body is encoded. */
export type BodyKind = 'json' | 'form' | 'multipart';

/**
 * One Core v4 action as this package calls it. The registry of all definitions is what the contract test compares
 * with Swagger (method, path, path/query parameter names, body encoding), and `request()` refuses to send a query
 * parameter that is not declared here — so the registry cannot drift from what the functions actually send.
 */
export interface EndpointDefinition {
  /** `<domain>.<functionName>`, unique across the package. */
  readonly name: string;
  readonly method: HttpMethod;
  /** Path below the API base (`/api/v4`), with `{name}` path parameters, e.g. `/Mapping/GetPoi/{poiId}`. Core route names stay exactly (wire typos included). */
  readonly path: string;
  /** Query parameter names this endpoint may send (Core's camelCase names). */
  readonly query?: readonly string[];
  readonly body?: BodyKind;
  /** No session needed and no bearer token sent (system config, SSO discovery). */
  readonly anonymous?: boolean;
  /** Cached GET: default TTL (ms) before the per-variant policy is applied. */
  readonly cacheTtlMs?: number;
  /** Non-JSON responses (file downloads). */
  readonly responseType?: 'json' | 'blob' | 'arraybuffer' | 'text';
}

type DefinitionInput = Omit<EndpointDefinition, 'name'>;

/** Declares a domain's endpoints; names become `<domain>.<key>`. */
export const defineEndpoints = <T extends Record<string, DefinitionInput>>(domain: string, definitions: T): { readonly [K in keyof T]: EndpointDefinition } => {
  const result: Record<string, EndpointDefinition> = {};
  for (const [key, definition] of Object.entries(definitions)) {
    result[key] = Object.freeze({ ...definition, name: `${domain}.${key}` });
  }
  return Object.freeze(result) as { readonly [K in keyof T]: EndpointDefinition };
};

const PATH_PARAM = /\{([A-Za-z0-9_]+)\}/g;

/** Path parameter names in template order. */
export const pathParamsOf = (path: string): string[] => [...path.matchAll(PATH_PARAM)].map((match) => match[1]);
