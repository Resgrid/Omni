import fs from 'fs';
import path from 'path';
import ts from 'typescript';

// The soft keyboard must never cover the field someone is typing in. The primitives own the fix (docs/subsystems/keyboard.md);
// these rules keep screens from rebuilding the bug: a note, reply or form field in a plain ScrollView, a transparent dialog
// that does not move up, or an iOS-only inset that a KeyboardAwareScrollView would double.
const REPO = path.resolve(__dirname, '../../../../..');
const ROOTS = [path.join(REPO, 'packages'), path.join(REPO, 'apps/omni')];
const SKIP = new Set(['node_modules', '__tests__', 'dist', 'ios', 'android', 'keyboard-avoiding-view']);
const INPUTS = new Set(['InputField', 'TextareaInput', 'TextInput']);

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? (SKIP.has(entry.name) ? [] : walk(path.join(dir, entry.name))) : /\.tsx$/.test(entry.name) ? [path.join(dir, entry.name)] : []));

interface Element {
  tag: string;
  attributes: ts.JsxAttributes;
  node: ts.Node;
  ancestors: string[];
}

/** Every JSX element in a file, with its tag and the tags around it. */
const elementsOf = (file: string): Element[] => {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Element[] = [];

  const visit = (node: ts.Node, ancestors: string[]) => {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;

    if (opening) {
      const tag = opening.tagName.getText(source);
      found.push({ tag, attributes: opening.attributes, node, ancestors });
      ts.forEachChild(node, (child) => visit(child, [...ancestors, tag]));

      return;
    }

    ts.forEachChild(node, (child) => visit(child, ancestors));
  };

  visit(source, []);

  return found;
};

const attribute = (element: Element, name: string) => element.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText() === name);

/** Elements inside this one (by source position, which is what nesting is in JSX). */
const inside = (element: Element, all: Element[]) => all.filter((other) => other.node.pos > element.node.pos && other.node.end <= element.node.end && other !== element);

const relative = (file: string) => path.relative(REPO, file);

const files = ROOTS.flatMap(walk);

describe('keyboard avoidance source rules', () => {
  it('scrolls text fields in a KeyboardAwareScrollView, unless a bottom sheet or the focused-input hook already keeps them in view', () => {
    const offenders = files.flatMap((file) => {
      const elements = elementsOf(file);

      return elements
        .filter((element) => element.tag === 'ScrollView' && !attribute(element, 'horizontal'))
        .filter((element) => !element.ancestors.includes('CustomBottomSheet'))
        .filter((element) => !(attribute(element, 'ref')?.getText() ?? '').includes('FocusedInputVisible'))
        .filter((element) => inside(element, elements).some((child) => INPUTS.has(child.tag)))
        .map(() => relative(file));
    });

    expect([...new Set(offenders)]).toEqual([]);
  });

  it('moves a transparent NativeModal dialog with a text field up for the keyboard', () => {
    const offenders = files.filter((file) => {
      const elements = elementsOf(file);

      return elements.some(
        (element) =>
          element.tag === 'NativeModal' &&
          attribute(element, 'transparent') &&
          inside(element, elements).some((child) => INPUTS.has(child.tag)) &&
          !inside(element, elements).some((child) => child.tag === 'BottomAnchoredKeyboardView')
      );
    });

    expect(offenders.map(relative)).toEqual([]);
  });

  it('never nests a KeyboardAwareScrollView in a bottom sheet, which already sits on top of the keyboard', () => {
    const offenders = files.filter((file) => elementsOf(file).some((element) => element.tag === 'KeyboardAwareScrollView' && element.ancestors.includes('CustomBottomSheet')));

    expect(offenders.map(relative)).toEqual([]);
  });

  it('leaves the iOS-only automaticallyAdjustKeyboardInsets out (KeyboardAwareScrollView covers both platforms)', () => {
    const offenders = files.filter((file) => elementsOf(file).some((element) => attribute(element, 'automaticallyAdjustKeyboardInsets')));

    expect(offenders.map(relative)).toEqual([]);
  });
});
