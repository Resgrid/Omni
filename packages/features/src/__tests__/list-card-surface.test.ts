import fs from 'fs';
import path from 'path';
import ts from 'typescript';

// List screens sit on `bg-background-50`; their row cards (protocols, contacts, notes…) are the raised
// `bg-background-0` surface so they stand out from it. A card in the screen's own colour only shows as a faint outline.
const FEATURES = path.resolve(__dirname, '..');
const SCREEN_SURFACE = 'bg-background-50';
const CARD_IMPORT = /^\.\.\/components\/([\w-]+-card)$/;

const screenFiles = (): string[] =>
  fs
    .readdirSync(FEATURES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(FEATURES, entry.name, 'screens')))
    .flatMap((entry) =>
      fs
        .readdirSync(path.join(FEATURES, entry.name, 'screens'))
        .filter((name) => name.endsWith('.tsx'))
        .map((name) => path.join(FEATURES, entry.name, 'screens', name))
    );

const parse = (file: string): ts.SourceFile => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const hasClass = (className: string | undefined, token: string): boolean => (className ?? '').split(/\s+/).includes(token);

/** Card files (`../components/x-card`) a list screen on the `bg-background-50` surface imports. */
const listCardFiles = (): string[] => {
  const cards = new Set<string>();

  for (const screen of screenFiles()) {
    const source = parse(screen);

    if (!source.text.includes(SCREEN_SURFACE)) continue;

    for (const statement of source.statements) {
      const match = ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) ? CARD_IMPORT.exec(statement.moduleSpecifier.text) : null;
      const cardFile = match ? path.resolve(path.dirname(screen), '..', 'components', `${match[1]}.tsx`) : null;

      if (cardFile && fs.existsSync(cardFile)) cards.add(cardFile);
    }
  }

  return [...cards].sort();
};

const pascalCase = (kebab: string): string =>
  kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/** The `className` of the outermost element the card's exported component renders (`NoteCard` for note-card.tsx). */
const rootClassName = (file: string): string | undefined => {
  const source = parse(file);
  const componentName = pascalCase(path.basename(file, '.tsx'));
  let component: ts.Node | undefined;

  const findComponent = (node: ts.Node): void => {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name?.getText() === componentName) component = node;
    else ts.forEachChild(node, findComponent);
  };

  findComponent(source);

  let className: string | undefined;
  let found = false;

  const findRoot = (node: ts.Node): void => {
    if (found) return;

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      found = true;
      const attribute = node.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === 'className');
      className = attribute?.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : undefined;

      return;
    }

    ts.forEachChild(node, findRoot);
  };

  if (component) findRoot(component);

  return className;
};

describe('list card surface', () => {
  it('finds the list cards to check', () => {
    const cards = listCardFiles().map((file) => path.relative(FEATURES, file));

    expect(cards).toEqual(expect.arrayContaining([path.join('notes', 'components', 'note-card.tsx'), path.join('protocols', 'components', 'protocol-card.tsx'), path.join('contacts', 'components', 'contact-card.tsx')]));
  });

  it('raises every list card off the screen background', () => {
    const flat = listCardFiles()
      .filter((file) => hasClass(rootClassName(file), SCREEN_SURFACE))
      .map((file) => path.relative(FEATURES, file));

    expect(flat).toEqual([]);
  });
});
