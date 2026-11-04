import fs from 'fs';
import path from 'path';
import ts from 'typescript';

// A list screen's "new" action (New Call, New Record…) is a floating action button over the list. The shell header
// already titles every routed screen, so a title row with a New button inside the screen is a second header.
const FEATURES = path.resolve(__dirname, '..');
const OPENS_NEW_ITEM = /router\.push\(\s*[\w.]*New\(\)/;

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

/** Elements whose onPress opens a blank "new" form, other than a Fab. */
const newItemButtonsIn = (file: string): string[] => {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const onPress = node.attributes.properties.find((attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute) && attribute.name.getText() === 'onPress');
      const tag = node.tagName.getText();

      if (onPress?.initializer && OPENS_NEW_ITEM.test(onPress.initializer.getText()) && tag !== 'Fab') {
        found.push(`${path.relative(FEATURES, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} <${tag}>`);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
};

describe('new-item actions', () => {
  it('finds the screens to check', () => {
    expect(screenFiles().some((file) => file.endsWith(path.join('calls', 'screens', 'call-list.tsx')))).toBe(true);
  });

  it('open a blank new form from a Fab, never a header button', () => {
    expect(screenFiles().flatMap(newItemButtonsIn)).toEqual([]);
  });
});
