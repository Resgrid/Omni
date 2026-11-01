#!/usr/bin/env node
// Refreshes packages/api/contract/swagger-v4.json — the Core v4 contract snapshot the endpoint contract test
// (src/__tests__/contract.test.ts) checks every endpoint definition against.
//
//   node packages/api/contract/refresh-swagger.mjs                      # from the public QA API
//   node packages/api/contract/refresh-swagger.mjs <url-or-file>        # e.g. a Core CI artifact or a local Core build
//
// The snapshot keeps only what the contract needs (paths, methods, parameter names/locations, body content types and
// schema refs, 200 response refs) so it stays small and diffs stay readable. Review the diff: a removed or renamed
// route/parameter is a Core contract break (Core changes must be additive), a new one is just an opportunity.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SOURCE = 'https://qaapi.resgrid.dev/swagger/v4/swagger.json';
const source = process.argv[2] ?? DEFAULT_SOURCE;
const target = join(dirname(fileURLToPath(import.meta.url)), 'swagger-v4.json');

const load = async () => {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`GET ${source} -> ${response.status}`);
    return response.json();
  }
  return JSON.parse(await readFile(source, 'utf8'));
};

const trimSchema = (schema) => {
  if (!schema || typeof schema !== 'object') return undefined;
  if (schema.$ref) return { $ref: schema.$ref };
  const out = {};
  for (const key of ['type', 'format', 'nullable']) if (schema[key] !== undefined) out[key] = schema[key];
  if (schema.items) out.items = trimSchema(schema.items);
  return out;
};

const swagger = await load();
const paths = {};
for (const [path, ops] of Object.entries(swagger.paths ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
  const trimmed = {};
  for (const [method, op] of Object.entries(ops)) {
    if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;
    const entry = {};
    if (op.parameters?.length) entry.parameters = op.parameters.map((p) => ({ name: p.name, in: p.in, ...(p.required ? { required: true } : {}), ...(p.schema ? { schema: trimSchema(p.schema) } : {}) }));
    if (op.requestBody?.content) {
      entry.requestBody = { content: Object.fromEntries(Object.entries(op.requestBody.content).map(([ct, c]) => [ct, { schema: trimSchema(c.schema) }])) };
      if (op.requestBody.required) entry.requestBody.required = true;
    }
    const ok = op.responses?.['200']?.content;
    if (ok) {
      const schema = Object.values(ok)[0]?.schema;
      if (schema) entry.responses = { 200: { schema: trimSchema(schema) } };
    }
    trimmed[method] = entry;
  }
  paths[path] = trimmed;
}

const snapshot = {
  openapi: swagger.openapi,
  info: { title: swagger.info?.title, version: swagger.info?.version },
  'x-snapshot': { source, fetchedAt: new Date().toISOString().slice(0, 10), note: 'Trimmed by packages/api/contract/refresh-swagger.mjs; paths only.' },
  paths,
};
await writeFile(target, `${JSON.stringify(snapshot, null, 1)}\n`);
console.log(`Wrote ${Object.keys(paths).length} paths to ${target}`);
