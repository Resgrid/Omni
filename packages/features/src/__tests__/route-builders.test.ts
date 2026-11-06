import { logger } from '@resgrid/core/logging/logger';
import type { RouteIdInput } from '@resgrid/core/navigation/route-paths';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

// Route builders run inside press handlers (`router.push(protocolRoutes.protocolDetail(protocol.Id))`), where a throw
// is an uncaught JS error that hard-crashes a release build on Android and iOS. That happened when protocols arrived
// without `Id`. So a builder refuses an unsafe or missing id with null (reported by `@resgrid/core/navigation/route-paths`)
// and callers navigate with `pushRoutePath` / `replaceRoutePath`, which skip null. TypeScript keeps `router.push` from
// taking the nullable result; these rules keep a builder from throwing and a caller from casting the null away.
const FEATURES = path.resolve(__dirname, '..');
const OMNI_APP = path.resolve(FEATURES, '..', '..', '..', 'apps', 'omni');
const SKIPPED_DIRS = new Set(['__tests__', 'node_modules', 'ios', 'android', 'e2e', 'dist', 'public']);

type RouteBuilder = (id: RouteIdInput) => string | null;

interface IdBuilder {
  file: string;
  routes: string;
  builder: string;
}

const relative = (file: string): string => path.relative(path.resolve(FEATURES, '..', '..', '..'), file).replace(/\\/g, '/');

const parse = (file: string): ts.SourceFile => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const routeFiles = (): string[] =>
  fs.readdirSync(FEATURES, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() && fs.existsSync(path.join(FEATURES, entry.name, 'routes.ts')) ? [path.join(FEATURES, entry.name, 'routes.ts')] : []));

const isSourceFile = (name: string): boolean => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name);

const isSkippedDir = (name: string): boolean => SKIPPED_DIRS.has(name) || name.startsWith('.');

/** Non-test TypeScript under `dir`, without tests, native projects, build output or dot folders. */
const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return isSkippedDir(entry.name) ? [] : sourceFiles(path.join(dir, entry.name));

    return isSourceFile(entry.name) ? [path.join(dir, entry.name)] : [];
  });

const visitAll = (node: ts.Node, visit: (node: ts.Node) => void): void => {
  visit(node);
  ts.forEachChild(node, (child) => visitAll(child, visit));
};

const ID_KEYWORDS = new Set([ts.SyntaxKind.StringKeyword, ts.SyntaxKind.NumberKeyword]);

const isMissingType = (type: ts.TypeNode): boolean => type.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isLiteralTypeNode(type) && type.literal.kind === ts.SyntaxKind.NullKeyword);

/** `string`, `number` or both, optionally with `| null` / `| undefined`: the parameter is an id. */
const isIdType = (type: ts.TypeNode | undefined): boolean => {
  if (!type) return false;

  const members = ts.isUnionTypeNode(type) ? [...type.types] : [type];

  return members.some((member) => ID_KEYWORDS.has(member.kind)) && members.every((member) => ID_KEYWORDS.has(member.kind) || isMissingType(member));
};

const unwrapConst = (node: ts.Expression): ts.Expression => (ts.isAsExpression(node) ? node.expression : node);

/** Builders of an exported `*Routes` object whose first parameter is an id. */
const idBuildersIn = (file: string): IdBuilder[] => {
  const builders: IdBuilder[] = [];

  visitAll(parse(file), (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || !node.name.text.endsWith('Routes') || !node.initializer) return;

    const object = unwrapConst(node.initializer);

    if (!ts.isObjectLiteralExpression(object)) return;

    for (const property of object.properties) {
      if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && ts.isArrowFunction(property.initializer) && isIdType(property.initializer.parameters[0]?.type)) {
        builders.push({ file, routes: node.name.text, builder: property.name.text });
      }
    }
  });

  return builders;
};

/** Builder functions a routes file also exports by name (`export const { callDetail } = callRoutes;`). */
const destructuredBuildersIn = (file: string): string[] => {
  const names: string[] = [];

  visitAll(parse(file), (node) => {
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && ts.isIdentifier(node.initializer) && node.initializer.text.endsWith('Routes')) {
      for (const element of node.name.elements) if (ts.isIdentifier(element.name)) names.push(element.name.text);
    }
  });

  return names;
};

const isBuilderCall = (node: ts.Node, destructured: ReadonlySet<string>): boolean => {
  if (!ts.isCallExpression(node)) return false;

  const callee = node.expression;

  return (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text.endsWith('Routes')) || (ts.isIdentifier(callee) && destructured.has(callee.text));
};

/** A route builder call inside `node`, not counting calls inside a nested function. */
const containsBuilderCall = (node: ts.Node, destructured: ReadonlySet<string>): boolean =>
  !ts.isFunctionLike(node) && (isBuilderCall(node, destructured) || ts.forEachChild(node, (child) => containsBuilderCall(child, destructured) || undefined) === true);

const isAsConst = (node: ts.AsExpression): boolean => ts.isTypeReferenceNode(node.type) && node.type.typeName.getText() === 'const';

/** Type and non-null assertions over a route builder's result: each one could hide a refused id's null from TypeScript. */
const builderAssertionsIn = (file: string, destructured: ReadonlySet<string>): string[] => {
  const source = parse(file);
  const found: string[] = [];

  visitAll(source, (node) => {
    const asserted = (ts.isAsExpression(node) && !isAsConst(node)) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node);

    if (asserted && containsBuilderCall(node.expression, destructured)) found.push(`${relative(file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${node.getText()}`);
  });

  return found;
};

const UNSAFE_IDS: RouteIdInput[] = ['../settings', 'a/b', 'x?tab=1', 'x#frag', '..', '', undefined, null, -1, 0, 1.5, Number.NaN];

/**
 * What a path built from an unsafe id must not contain: a dot segment, the id's own separator, query or fragment, or
 * the text of a missing value (`/map?callId=undefined`). An id URI-encoded into a query value is harmless.
 */
const leaksUnsafeId = (result: string, id: RouteIdInput): boolean => {
  const text = String(id);
  const [pathPart = ''] = result.split('?');

  return /undefined|null|NaN/.test(result) || pathPart.split('/').some((segment) => segment === '.' || segment === '..') || (/[/\\?#]/.test(text) && result.includes(text));
};

describe('feature route builders', () => {
  it('finds the route files and id builders to check', () => {
    const files = routeFiles();

    expect(files.some((file) => file.endsWith(path.join('protocols', 'routes.ts')))).toBe(true);
    expect(files.flatMap(idBuildersIn).map(({ routes, builder }) => `${routes}.${builder}`)).toEqual(
      expect.arrayContaining(['protocolRoutes.protocolDetail', 'callRoutes.callDetail', 'poisRoutes.detail', 'unitRoutesRoutes.active'])
    );
  });

  it('never throw: a refused id is a null path, not an uncaught error from a press handler', () => {
    const throwing = routeFiles().flatMap((file) => {
      const source = parse(file);
      const lines: string[] = [];

      visitAll(source, (node) => {
        if (ts.isThrowStatement(node)) lines.push(`${relative(file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      });

      return lines;
    });

    expect(throwing).toEqual([]);
  });

  it('refuse unsafe and missing ids with a reported null, or build a path without them', () => {
    const reportError = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const failures: string[] = [];

    try {
      for (const { file, routes, builder } of routeFiles().flatMap(idBuildersIn)) {
        const build = jest.requireActual<Partial<Record<string, Partial<Record<string, RouteBuilder>>>>>(file)[routes]?.[builder];

        if (!build) {
          failures.push(`${routes}.${builder}: not exported`);
          continue;
        }

        for (const id of UNSAFE_IDS) {
          const label = `${routes}.${builder}([${String(id)}])`;

          reportError.mockClear();

          let result: string | null;

          try {
            result = build(id);
          } catch (error) {
            failures.push(`${label} threw ${String(error)}`);
            continue;
          }

          if (result === null) {
            if (reportError.mock.calls.length === 0) failures.push(`${label} returned null without reporting it`);
          } else if (leaksUnsafeId(result, id)) {
            failures.push(`${label} built ${result}`);
          }
        }
      }
    } finally {
      reportError.mockRestore();
    }

    expect(failures).toEqual([]);
  });

  it('are never asserted at a call site, so a refused id cannot be cast into router.push', () => {
    const destructured = new Set(routeFiles().flatMap(destructuredBuildersIn));
    const callers = [...sourceFiles(FEATURES), ...sourceFiles(OMNI_APP)].filter((file) => path.basename(file) !== 'routes.ts');

    expect(callers.some((file) => file.endsWith(path.join('protocols', 'screens', 'protocol-list.tsx')))).toBe(true);
    expect(callers.flatMap((file) => builderAssertionsIn(file, destructured))).toEqual([]);
  });
});
