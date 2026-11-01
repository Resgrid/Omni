/**
 * The full per-variant route contract (omni-plan §5.3.4, §12) for Jest — Node only; never import it from app code.
 * On top of `checkRouteContract` (declared routes ↔ files, nav hrefs, nav registration) it reads the source:
 *
 * 1. every route file is a one-line re-export (`export { X as default } from '…'`) of a value that exists;
 * 2. the variant is entitled to every route it declares (the canonical route's capability / module gate);
 * 3. no route re-exports a variant-only feature module (`features/<module>`) the manifest does not list, and no nav
 *    entry requires such a module;
 * 4. every href builder that a feature the variant ships calls (from its `routes.ts`, found by reading the feature's
 *    code) produces a canonical path, and that path is declared unless the variant is not entitled to it.
 *
 * Everything is derived from the route tree, the manifest, nav.ts and the feature sources, so a route or feature added
 * later is covered without touching the test.
 */
import fs from 'node:fs';
import path from 'node:path';

import { FEATURE_MODULES, type FeatureModuleId, type VariantManifest } from '@resgrid/config';
import ts from 'typescript';

import type { NavRegistry } from '../nav/define-nav';
import { CANONICAL_ROUTES, isRouteAvailableFor, ROUTE_KEYS, type RouteKey } from '../routes/canonical';
import { defineRoutes, type RouteContract } from '../routes/define-routes';
import { checkRouteContract, type RouteContractReport } from './route-contract';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const PLATFORM_INFIXES = ['', '.native', '.web', '.ios', '.android'];
const LAYOUT_FILE = /(^|\/)_layout(\.(web|native|ios|android))?\.(tsx|ts|jsx|js)$/;
const SPECIAL_FILE = /(^|\/)\+(html|native-intent|middleware|api)/;

const toPosix = (value: string): string => value.split(path.sep).join('/');

function readSource(file: string): ts.SourceFile {
  const text = fs.readFileSync(file, 'utf8');
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

const isFile = (candidate: string): boolean => {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
};

/** Resolves a TypeScript module specifier (`./x`, `@resgrid/<pkg>[/sub]`) to a source file; null for other packages. */
export function resolveSourceModule(specifier: string, fromFile: string, repoRoot: string): string | null {
  let base: string;
  if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    const match = /^@resgrid\/([a-z-]+)(?:\/(.+))?$/.exec(specifier);
    if (!match) {
      return null;
    }
    base = path.join(repoRoot, 'packages', match[1], 'src', match[2] ?? 'index');
  }
  for (const candidate of [base, path.join(base, 'index')]) {
    for (const infix of PLATFORM_INFIXES) {
      for (const extension of SOURCE_EXTENSIONS) {
        const file = `${candidate}${infix}${extension}`;
        if (isFile(file)) {
          return file;
        }
      }
    }
  }
  return null;
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean => (ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind) : false);

/**
 * Whether `file` exports a value named `name` (`default` included), following re-exports and `export *` through
 * `@resgrid/*` and relative modules. Type-only exports do not count.
 */
export function hasValueExport(file: string, name: string, repoRoot: string, seen: Set<string> = new Set()): boolean {
  const key = `${file}#${name}`;
  if (seen.has(key)) {
    return false;
  }
  seen.add(key);
  const source = readSource(file);
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement) && !statement.isExportEquals && name === 'default') {
      return true;
    }
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword) ? name === 'default' : statement.name?.text === name) {
        return true;
      }
    }
    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) ? declaration.name.text === name : declaration.name.elements.some((element) => ts.isBindingElement(element) && ts.isIdentifier(element.name) && element.name.text === name)) {
          return true;
        }
      }
    }
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) {
      continue;
    }
    const specifier = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : null;
    const target = specifier ? resolveSourceModule(specifier, file, repoRoot) : null;
    const clause = statement.exportClause;
    if (!clause) {
      // export * from '…' (never re-exports `default`)
      if (name !== 'default' && target && hasValueExport(target, name, repoRoot, seen)) {
        return true;
      }
      continue;
    }
    if (ts.isNamespaceExport(clause)) {
      if (clause.name.text === name) {
        return true;
      }
      continue;
    }
    for (const element of clause.elements) {
      if (element.isTypeOnly || element.name.text !== name) {
        continue;
      }
      if (!specifier) {
        // A local binding re-exported by name (`export { X }`): it exists in this module.
        return true;
      }
      // An external package's export cannot be checked here; @resgrid/* and relative modules are followed.
      return target ? hasValueExport(target, (element.propertyName ?? element.name).text, repoRoot, seen) : !specifier.startsWith('.') && !specifier.startsWith('@resgrid/');
    }
  }
  return false;
}

export interface RouteReexport {
  /** Route file relative to the app dir. */
  file: string;
  specifier: string;
  /** The re-exported name (`default` for `export { default } from`). */
  imported: string;
}

/** A route file's one re-export, or the reason it is not one (route files hold no logic and no tests). */
export function readRouteReexport(file: string): { specifier: string; imported: string } | { problem: string } {
  const source = readSource(file);
  let found: { specifier: string; imported: string } | null = null;
  for (const statement of source.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.isTypeOnly ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      return { problem: 'route files may only re-export (`export { X as default } from …`): move logic into a feature screen' };
    }
    const element = statement.exportClause.elements.find((candidate) => candidate.name.text === 'default');
    if (element) {
      found = { specifier: statement.moduleSpecifier.text, imported: (element.propertyName ?? element.name).text };
    }
  }
  return found ?? { problem: 'route file has no default export' };
}

function walkRouteFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkRouteFiles(full, out);
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
}

/** Every non-layout route file's re-export, plus problems (logic in a route file, a re-exported name that does not exist). */
export function checkRouteReexports(appDir: string, repoRoot: string): { reexports: RouteReexport[]; problems: string[] } {
  const files: string[] = [];
  walkRouteFiles(appDir, files);
  const reexports: RouteReexport[] = [];
  const problems: string[] = [];
  for (const full of files.sort()) {
    const file = toPosix(path.relative(appDir, full));
    if (/\.test\./.test(file)) {
      problems.push(`${file}: tests do not belong in the route tree (test the screen in @resgrid/features)`);
      continue;
    }
    if (LAYOUT_FILE.test(file) || SPECIAL_FILE.test(file)) {
      continue;
    }
    const parsed = readRouteReexport(full);
    if ('problem' in parsed) {
      problems.push(`${file}: ${parsed.problem}`);
      continue;
    }
    const target = resolveSourceModule(parsed.specifier, full, repoRoot);
    if (!target) {
      problems.push(`${file}: cannot resolve "${parsed.specifier}" (route files re-export from @resgrid/* packages)`);
      continue;
    }
    if (!hasValueExport(target, parsed.imported, repoRoot)) {
      problems.push(`${file}: "${parsed.specifier}" has no export named "${parsed.imported}"`);
      continue;
    }
    reexports.push({ file, specifier: parsed.specifier, imported: parsed.imported });
  }
  return { reexports, problems };
}

/** `@resgrid/features/calls[/…]` → `calls`. */
export const featureOfSpecifier = (specifier: string): string | null => /^@resgrid\/features\/([a-z0-9-]+)/.exec(specifier)?.[1] ?? null;

export interface FeatureRouteUse {
  /** The feature whose routes.ts defines the builder. */
  feature: string;
  /** `callRoutes.callEdit` or `callDetail`. */
  builder: string;
  /** Path the builder produced for a sample id (query string removed). */
  path: string;
  /** Where it is called (first call site), relative to the features source dir. */
  calledFrom: string;
}

export type LoadFeatureRoutes = (feature: string) => Record<string, unknown>;

const SAMPLE_ARGUMENTS: readonly (readonly unknown[])[] = [['1'], [1], [], [{}]];

/** Calls a builder with sample ids until one produces a string; the path without its query, or null. */
export function evaluateRouteBuilder(builder: (...args: unknown[]) => unknown): string | null {
  for (const args of SAMPLE_ARGUMENTS) {
    try {
      const result = builder(...args);
      if (typeof result === 'string') {
        return result.split(/[?#]/, 1)[0] ?? result;
      }
    } catch {
      // Try the next sample (builders validate their ids).
    }
  }
  return null;
}

function walkSources(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSources(full, out);
    } else if (/\.(tsx|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts') && !/\.test\./.test(entry.name) && entry.name !== 'routes.ts') {
      out.push(full);
    }
  }
}

/** The feature whose routes an import specifier names, seen from a file of `feature`: `../routes`, `@resgrid/features/x[/routes]`. */
function routesFeatureOf(specifier: string, feature: string): string | null {
  if (specifier.startsWith('.')) {
    return /(^|\/)routes$/.test(specifier) ? feature : null;
  }
  const match = /^@resgrid\/features\/([a-z0-9-]+)(\/routes)?$/.exec(specifier);
  return match ? match[1] : null;
}

/**
 * The href builders a feature's code calls (`xRoutes.detail(id)`, or a builder imported by name), evaluated to paths.
 * Builders come from the feature's own routes.ts or another feature's (imported through its barrel or `/routes`).
 */
export function findFeatureRouteUses(featuresDir: string, feature: string, loadRoutes: LoadFeatureRoutes): FeatureRouteUse[] {
  const files: string[] = [];
  walkSources(path.join(featuresDir, feature), files);
  const uses = new Map<string, FeatureRouteUse>();
  const modules = new Map<string, Record<string, unknown>>();
  const routesOf = (name: string): Record<string, unknown> => {
    let loaded = modules.get(name);
    if (!loaded) {
      loaded = loadRoutes(name);
      modules.set(name, loaded);
    }
    return loaded;
  };

  for (const file of files.sort()) {
    const source = readSource(file);
    // Local name → [feature, exported name] for imports of route builders.
    const imported = new Map<string, { feature: string; name: string }>();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.importClause?.isTypeOnly) {
        continue;
      }
      const owner = routesFeatureOf(statement.moduleSpecifier.text, feature);
      const bindings = statement.importClause?.namedBindings;
      if (!owner || !bindings || !ts.isNamedImports(bindings)) {
        continue;
      }
      for (const element of bindings.elements) {
        const exportedName = (element.propertyName ?? element.name).text;
        if (!element.isTypeOnly && Object.prototype.hasOwnProperty.call(routesOf(owner), exportedName)) {
          imported.set(element.name.text, { feature: owner, name: exportedName });
        }
      }
    }
    if (imported.size === 0) {
      continue;
    }

    const record = (owner: string, builder: string, fn: unknown, node: ts.Node): void => {
      if (typeof fn !== 'function' || uses.has(`${owner}:${builder}`)) {
        return;
      }
      const resolved = evaluateRouteBuilder(fn as (...args: unknown[]) => unknown);
      // routes.ts may also export helpers (id parsers); only functions that build a path are links.
      if (resolved === null || !resolved.startsWith('/')) {
        return;
      }
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      uses.set(`${owner}:${builder}`, { feature: owner, builder, path: resolved, calledFrom: `${toPosix(path.relative(featuresDir, file))}:${line + 1}` });
    };

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const direct = ts.isIdentifier(callee) ? imported.get(callee.text) : undefined;
        const member = ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) ? imported.get(callee.expression.text) : undefined;
        if (direct) {
          record(direct.feature, direct.name, routesOf(direct.feature)[direct.name], node);
        } else if (member && ts.isPropertyAccessExpression(callee)) {
          const holder = routesOf(member.feature)[member.name];
          if (holder && typeof holder === 'object') {
            record(member.feature, `${member.name}.${callee.name.text}`, (holder as Record<string, unknown>)[callee.name.text], node);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return Array.from(uses.values()).sort((a, b) => a.builder.localeCompare(b.builder));
}

/** Every canonical route except the catch-all: what a feature path must match. */
const ALL_CANONICAL: RouteContract = defineRoutes(ROUTE_KEYS.filter((key) => key !== 'missing'));

export const resolveCanonicalPath = (routePath: string): RouteKey | null => ALL_CANONICAL.resolve(routePath);

const isFeatureModule = (value: string): value is FeatureModuleId => (FEATURE_MODULES as readonly string[]).includes(value);

export interface VariantContractInput {
  variantId: string;
  /** `apps/omni/variants/<v>/app`. */
  appDir: string;
  manifest: VariantManifest;
  routes: RouteContract;
  nav: NavRegistry;
  repoRoot: string;
  /** Loads `packages/features/src/<feature>/routes.ts` (the test decides how to keep its imports light). */
  loadFeatureRoutes: LoadFeatureRoutes;
  /** Features the variant ships outside the route tree (gate screens and overlays registered by the app layer). */
  extraFeatures?: readonly string[];
}

export interface VariantContractReport extends RouteContractReport {
  reexports: RouteReexport[];
  /** Features the route tree (and `extraFeatures`) pulls in. */
  features: string[];
  routeUses: FeatureRouteUse[];
  problems: string[];
}

export function checkVariantContract(input: VariantContractInput): VariantContractReport {
  const { manifest } = input;
  const base = checkRouteContract(input.variantId, input.appDir, { routes: input.routes, nav: input.nav, shellKind: manifest.shell.kind });
  const problems = [
    ...base.missingFiles.map((item) => `declared route has no file: ${item}`),
    ...base.undeclaredFiles.map((item) => `route file is not declared in defineRoutes(): ${item}`),
    ...base.unresolvedNav.map((item) => `nav entry does not resolve to a declared route: ${item}`),
    ...base.unregisteredAppRoutes.map((item) => `(app) route has no nav registry entry: ${item}`),
  ];

  const { reexports, problems: reexportProblems } = checkRouteReexports(input.appDir, input.repoRoot);
  problems.push(...reexportProblems);

  for (const key of input.routes.keys) {
    if (!isRouteAvailableFor(key, manifest)) {
      const spec = CANONICAL_ROUTES[key] as { module?: string };
      problems.push(`route ${key} (${CANONICAL_ROUTES[key].pattern}) is declared but ${manifest.id} is not entitled to it${spec.module ? ` (module "${spec.module}" / capability)` : ' (capability)'}`);
    }
  }

  const features = Array.from(new Set([...reexports.map((entry) => featureOfSpecifier(entry.specifier)).filter((name): name is string => name !== null), ...(input.extraFeatures ?? [])])).sort();
  // A module folder's screen needs the module, unless the canonical route it serves states its own entitlement (the
  // shared incident-command board that Dispatch opens at /call/[id]/command under `incidentCommand: 'assist'`).
  const pathOfFile = new Map(base.routes.map((route) => [route.file, route.path]));
  for (const entry of reexports) {
    const feature = featureOfSpecifier(entry.specifier);
    if (!feature || !isFeatureModule(feature) || manifest.modules.includes(feature)) {
      continue;
    }
    const routePath = pathOfFile.get(entry.file);
    const key = routePath ? resolveCanonicalPath(routePath) : null;
    const spec = key ? (CANONICAL_ROUTES[key] as { requires?: unknown; module?: string }) : null;
    if (!spec || spec.requires === undefined || spec.module !== undefined) {
      problems.push(`${entry.file} re-exports the "${feature}" module, which ${manifest.id}'s variant.json does not list`);
    }
  }
  for (const entry of input.nav.entries) {
    if (entry.requiresModule && !manifest.modules.includes(entry.requiresModule)) {
      problems.push(`nav entry ${entry.id} requires module "${entry.requiresModule}", which ${manifest.id}'s variant.json does not list`);
    }
  }

  const featuresDir = path.join(input.repoRoot, 'packages', 'features', 'src');
  const routeUses = features.flatMap((feature) => findFeatureRouteUses(featuresDir, feature, input.loadFeatureRoutes));
  for (const use of routeUses) {
    const key = resolveCanonicalPath(use.path);
    if (!key) {
      problems.push(`${use.feature} builder ${use.builder} (${use.calledFrom}) produces "${use.path}", which is not a canonical route (packages/app-shell/src/routes/canonical.ts)`);
    } else if (isRouteAvailableFor(key, manifest) && !input.routes.has(key)) {
      problems.push(`${use.feature} builder ${use.builder} (${use.calledFrom}) links to ${key} (${CANONICAL_ROUTES[key].pattern}), which ${manifest.id} ships the feature for but does not declare`);
    }
  }

  return { ...base, reexports, features, routeUses, problems };
}

/** Throws a readable error listing every violation of the full variant contract. */
export function assertVariantContract(input: VariantContractInput): VariantContractReport {
  const report = checkVariantContract(input);
  if (report.problems.length > 0) {
    throw new Error(`Route contract for "${input.variantId}" failed:\n  - ${report.problems.join('\n  - ')}`);
  }
  return report;
}
