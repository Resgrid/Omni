import { render, screen } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { ScrollView } from '../index';

const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {};

describe('ScrollView', () => {
  it('keeps a horizontal scroller to its content height, so a chip row neither takes half the screen nor vanishes', async () => {
    await render(
      <ScrollView horizontal testID="chips">
        <Text>Chip</Text>
      </ScrollView>
    );
    expect(styleOf('chips')).toMatchObject({ flexGrow: 0, flexShrink: 0 });
  });

  it('lets a screen’s own style win, as a scroller in a row passes flexShrink 1', async () => {
    await render(<ScrollView horizontal style={{ flexShrink: 1, marginTop: 8 }} testID="chips" />);
    expect(styleOf('chips')).toMatchObject({ flexGrow: 0, flexShrink: 1, marginTop: 8 });
  });

  it('leaves a vertical scroller as React Native has it', async () => {
    await render(<ScrollView style={{ marginTop: 8 }} testID="list" />);
    expect(styleOf('list')).toEqual({ marginTop: 8 });
  });
});

// The fix lives here once: a horizontal ScrollView taken straight from React Native, anywhere else, brings the bug back.
describe('horizontal ScrollView source rule', () => {
  const ROOTS = [path.resolve(__dirname, '../../../..'), path.resolve(__dirname, '../../../../../apps/omni')];
  const SKIP = new Set(['node_modules', '__tests__', 'dist', 'ios', 'android', 'ui']);
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? (SKIP.has(entry.name) ? [] : walk(path.join(dir, entry.name))) : /\.tsx$/.test(entry.name) ? [path.join(dir, entry.name)] : []));

  it('renders horizontal scrollers only through @resgrid/ui', () => {
    const offenders = ROOTS.flatMap(walk).filter((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return /import\s*\{[^}]*\bScrollView\b[^}]*\}\s*from 'react-native'/.test(text) && /<ScrollView\s[^>]*?\bhorizontal\b/.test(text);
    });
    expect(offenders.map((file) => path.relative(path.resolve(__dirname, '../../../../..'), file))).toEqual([]);
  });
});
