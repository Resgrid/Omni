import fs from 'fs';
import path from 'path';
import ts from 'typescript';

// On the web React Native Web renders a pressable with the button role as <button>, and a button may not hold another
// button or any focusable control: React logs "<button> cannot contain a nested <button>" on every render and browsers
// re-parent the markup. A card or row that is a button keeps its own buttons beside it (a sibling laid over or next to
// it), never inside it. This rule catches the nesting written in one file; a component that renders a slot prop
// (`right`, `actions`) inside its button needs its own test (dispatch console `PanelFrame`).
const ROOTS = [path.resolve(__dirname, '../../../..'), path.resolve(__dirname, '../../../../../apps/omni')];
const REPO = path.resolve(__dirname, '../../../../..');
const SKIP = new Set(['node_modules', '__tests__', 'dist', 'ios', 'android']);
const PRESSABLES = new Set(['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'Button', 'Link']);

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? (SKIP.has(entry.name) ? [] : walk(path.join(dir, entry.name))) : /\.tsx$/.test(entry.name) ? [path.join(dir, entry.name)] : []));

const roleOf = (element: ts.JsxOpeningLikeElement): string =>
  element.attributes.properties
    .filter((attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute) && ['accessibilityRole', 'role'].includes(attribute.name.getText()))
    .map((attribute) => attribute.initializer?.getText() ?? '')
    .join(' ');

/** gluestack's Button is always a button; a pressable is one when its role can be 'button'. */
const isButton = (element: ts.JsxOpeningLikeElement): boolean => {
  const tag = element.tagName.getText();

  return tag === 'Button' || (PRESSABLES.has(tag) && tag !== 'Link' && /button/.test(roleOf(element)));
};

const nestedInButtons = (file: string): string[] => {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const lineOf = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;

  const visit = (node: ts.Node, button: ts.JsxOpeningLikeElement | null): void => {
    if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) {
      ts.forEachChild(node, (child) => visit(child, button));

      return;
    }

    const opening = ts.isJsxElement(node) ? node.openingElement : node;

    if (button && PRESSABLES.has(opening.tagName.getText())) {
      found.push(`${path.relative(REPO, file)}:${lineOf(opening)} <${opening.tagName.getText()}> inside the button at line ${lineOf(button)}`);
    }

    // Props are not children: a pressable passed as a prop renders wherever the component puts it.
    ts.forEachChild(opening.attributes, (child) => visit(child, null));
    const inner = isButton(opening) ? opening : button;

    if (ts.isJsxElement(node)) node.children.forEach((child) => visit(child, inner));
  };

  visit(source, null);

  return found;
};

describe('nested pressables source rule', () => {
  it('never puts a pressable inside a button', () => {
    expect(ROOTS.flatMap(walk).flatMap(nestedInButtons)).toEqual([]);
  });
});
