import { fireEvent, render, screen } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { ScrollRow } from '../scroll-row';
import { lightTokens } from '../theme/tokens';

const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

// A 200-wide row over 500 of chips.
const measure = async (testID = 'scroll-row', contentWidth = 500) => {
  const scrollView = screen.getByTestId(`${testID}-scroll-view`);

  await fireEvent(scrollView, 'layout', { nativeEvent: { layout: { width: 200 } } });
  await fireEvent(scrollView, 'contentSizeChange', contentWidth, 36);

  return scrollView;
};

const chips = ['All', 'Engine', 'Ladder', 'Rescue', 'Medic', 'Hazmat'].map((label) => <Text key={label}>{label}</Text>);

describe('ScrollRow', () => {
  it('keeps its content height, takes the caller’s box style and passes scroller props through', async () => {
    await render(
      <ScrollRow style={{ marginBottom: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Filters" contentContainerStyle={{ paddingHorizontal: 16 }} testID="filters">
        {chips}
      </ScrollRow>
    );

    // Neither half a screen above a list nor squeezed to nothing above a full-height empty state.
    expect(styleOf('filters')).toMatchObject({ flexGrow: 0, flexShrink: 0, marginBottom: 8 });
    const scroller = screen.getByTestId('filters-scroll-view');
    expect(scroller.props.horizontal).toBe(true);
    expect(scroller.props.accessibilityRole).toBe('radiogroup');
    expect(scroller.props.accessibilityLabel).toBe('Filters');
    expect(screen.getByText('Hazmat')).toBeTruthy();
  });

  it('lets a row beside other items fill the width left', async () => {
    await render(
      <ScrollRow style={{ flexGrow: 1, flexShrink: 1 }} testID="filters">
        {chips}
      </ScrollRow>
    );

    expect(styleOf('filters')).toMatchObject({ flexGrow: 1, flexShrink: 1 });
  });

  // Chip rows (POI types, categories, years, filters) ran off a phone's edge with nothing to say more were there.
  it('shows a round chevron at each edge with chips past it, readable on any background, and pages that way', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    await render(<ScrollRow testID="filters">{chips}</ScrollRow>);
    const scrollView = await measure('filters');

    expect(screen.queryByTestId('filters-left-overflow')).toBeNull();
    const right = screen.getByRole('button', { name: 'Scroll right' });
    expect(StyleSheet.flatten(right.props.style)).toMatchObject({ width: 28, height: 28, borderRadius: 14, borderWidth: 1, backgroundColor: lightTokens['background-0'], borderColor: lightTokens['outline-300'] });

    await fireEvent.press(right);
    // One row width less both chevrons, so the chip cut off at the edge comes fully into view.
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 144, animated: true });

    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 150, y: 0 } } });
    expect(screen.getByRole('button', { name: 'Scroll left' })).toBeTruthy();
    expect(screen.getByTestId('filters-right-overflow')).toBeTruthy();

    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 300, y: 0 } } });
    expect(screen.queryByTestId('filters-right-overflow')).toBeNull();
    await fireEvent.press(screen.getByTestId('filters-left-overflow'));
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 156, animated: true });

    scrollTo.mockRestore();
  });

  it('shows no chevrons when every chip fits, or when the caller turns them off', async () => {
    await render(<ScrollRow testID="filters">{chips}</ScrollRow>);
    await measure('filters', 180);
    expect(screen.queryByTestId('filters-left-overflow')).toBeNull();
    expect(screen.queryByTestId('filters-right-overflow')).toBeNull();

    await render(
      <ScrollRow testID="quiet" showOverflowIndicators={false}>
        {chips}
      </ScrollRow>
    );
    await measure('quiet');
    expect(screen.queryByTestId('quiet-right-overflow')).toBeNull();
  });

  it('still reports layout, size and scroll to the caller', async () => {
    const onLayout = jest.fn();
    const onContentSizeChange = jest.fn();
    const onScroll = jest.fn();
    await render(
      <ScrollRow onLayout={onLayout} onContentSizeChange={onContentSizeChange} onScroll={onScroll}>
        {chips}
      </ScrollRow>
    );
    const scrollView = await measure();
    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 10, y: 0 } } });

    expect(onLayout).toHaveBeenCalled();
    expect(onContentSizeChange).toHaveBeenCalledWith(500, 36);
    expect(onScroll).toHaveBeenCalled();
  });
});

// The chevrons live in ScrollRow (chips) and TabBar (tabs): a horizontal ScrollView written into a screen has neither.
describe('sideways row source rule', () => {
  const PACKAGES = path.resolve(__dirname, '../../..');
  const REPO = path.resolve(PACKAGES, '..');
  const ROOTS = [PACKAGES, path.resolve(REPO, 'apps/omni')];
  const SKIP = new Set(['node_modules', '__tests__', 'dist', 'ios', 'android', 'ui', '.metro-cache', '.expo']);
  const HORIZONTAL_SCROLLER = /<ScrollView\s[^>]*?\bhorizontal\b/;

  // File → why it scrolls sideways without edge chevrons.
  const ALLOWED = new Map([['packages/features/src/incident-command/components/structure-board.tsx', 'a board of command columns that shows its own scroll bar']]);

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? (SKIP.has(entry.name) ? [] : walk(path.join(dir, entry.name))) : /\.tsx$/.test(entry.name) ? [path.join(dir, entry.name)] : []));

  it('scrolls chip and filter rows sideways only through ScrollRow (or TabBar)', () => {
    const offenders = ROOTS.flatMap(walk).flatMap((absolute) => {
      const file = path.relative(REPO, absolute).replace(/\\/g, '/');

      return !ALLOWED.has(file) && HORIZONTAL_SCROLLER.test(fs.readFileSync(absolute, 'utf8')) ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });

  it('lists only files that still need it', () => {
    const stale = [...ALLOWED.keys()].filter((file) => {
      const absolute = path.resolve(REPO, file);

      return !fs.existsSync(absolute) || !HORIZONTAL_SCROLLER.test(fs.readFileSync(absolute, 'utf8'));
    });

    expect(stale).toEqual([]);
  });
});
