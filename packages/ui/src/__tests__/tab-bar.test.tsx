import { fireEvent, render, screen } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { TabBar, type TabBarItem } from '../tab-bar';
import { lightTokens } from '../theme/tokens';

type View = 'today' | 'mine' | 'signup' | 'calendar' | 'trades' | 'onduty';

const TABS: TabBarItem<View>[] = [
  { key: 'today', label: 'Today' },
  { key: 'mine', label: 'My Shifts' },
  { key: 'signup', label: 'Sign Up' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'trades', label: 'Trades', badge: 2, accessibilityLabel: 'Trades, 2 pending', accessibilityHint: 'Shows this view' },
  { key: 'onduty', label: 'On Duty', testID: 'custom-onduty' },
];

const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

// Each tab 90 wide at 100 spacing in a 200-wide strip over a 600-wide row: the first two are in view at the start.
const measure = async (testID = 'tab-bar') => {
  for (const [index, tab] of TABS.entries()) {
    await fireEvent(screen.getByTestId(tab.testID ?? `${testID}-tab-${tab.key}`), 'layout', { nativeEvent: { layout: { x: index * 100, y: 0, width: 90, height: 40 } } });
  }

  const scrollView = screen.getByTestId(`${testID}-scroll-view`);

  await fireEvent(scrollView, 'layout', { nativeEvent: { layout: { width: 200 } } });
  await fireEvent(scrollView, 'contentSizeChange', 600, 40);

  return scrollView;
};

describe('TabBar', () => {
  it('shows labels as given, marks the selected tab and reports the key and index on press', async () => {
    const onChange = jest.fn();
    await render(<TabBar tabs={TABS} activeKey="today" onChange={onChange} variant="pills" />);

    expect(screen.getByText('My Shifts')).toBeTruthy();
    expect(screen.getByTestId('tab-bar-scroll-view').props.accessibilityRole).toBe('tablist');
    expect(screen.getByTestId('tab-bar-tab-today')).toBeSelected();
    expect(screen.getByTestId('tab-bar-tab-mine')).not.toBeSelected();

    await fireEvent.press(screen.getByTestId('tab-bar-tab-signup'));
    expect(onChange).toHaveBeenCalledWith('signup', 2);

    // A caller's id, accessible name and hint win.
    expect(screen.getByTestId('custom-onduty')).toBeTruthy();
    expect(screen.getByTestId('tab-bar-tab-trades')).toHaveAccessibleName('Trades, 2 pending');
    expect(screen.getByTestId('tab-bar-tab-trades').props.accessibilityHint).toBe('Shows this view');
  });

  it('selects nothing for a key that is not in the list', async () => {
    await render(<TabBar tabs={TABS} activeKey={null} onChange={jest.fn()} variant="pills" />);

    for (const tab of TABS.slice(0, 5)) expect(screen.getByTestId(`tab-bar-tab-${tab.key}`)).not.toBeSelected();
  });

  it('draws page pills as bordered pills on a full-width strip, filled when selected, with the count inline', async () => {
    await render(<TabBar tabs={TABS} activeKey="today" onChange={jest.fn()} variant="pills" />);

    expect(styleOf('tab-bar')).toMatchObject({ backgroundColor: lightTokens['background-0'], borderBottomWidth: 1, flexGrow: 0, flexShrink: 0 });
    expect(styleOf('tab-bar-tab-today')).toMatchObject({ backgroundColor: lightTokens['primary-600'], borderColor: lightTokens['primary-600'], borderWidth: 1, borderRadius: 9999, minHeight: 40 });
    expect(styleOf('tab-bar-tab-mine')).toMatchObject({ backgroundColor: lightTokens['background-0'], borderColor: lightTokens['outline-300'] });
    expect(styleOf('tab-bar-tab-today-label')).toMatchObject({ fontSize: 14, lineHeight: 20, color: lightTokens['typography-0'] });

    // Inline (not pinned to a corner) and red while the tab is not selected.
    const badge = styleOf('tab-bar-tab-trades-badge');
    expect(badge.position).toBeUndefined();
    expect(badge).toMatchObject({ marginLeft: 8, backgroundColor: lightTokens['error-500'] });
    expect(screen.getByTestId('tab-bar-tab-trades-badge')).toHaveTextContent('2');
  });

  it('turns the count into a light chip on the selected pill', async () => {
    await render(<TabBar tabs={TABS} activeKey="trades" onChange={jest.fn()} variant="pills" />);

    expect(styleOf('tab-bar-tab-trades-badge')).toMatchObject({ backgroundColor: lightTokens['background-0'] });
  });

  // The Shifts strip ran its views off the right edge of a phone with nothing to say so.
  it('shows a chevron on each side that has tabs off-screen, on the strip’s own colour, and pages towards them', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    await render(<TabBar tabs={TABS} activeKey="today" onChange={jest.fn()} variant="pills" testID="shifts" />);
    const scrollView = await measure('shifts');

    expect(screen.queryByTestId('shifts-left-overflow')).toBeNull();
    expect(screen.getByRole('button', { name: 'Scroll tabs right' })).toBeTruthy();
    expect(styleOf('shifts-right-overflow')).toMatchObject({ backgroundColor: lightTokens['background-0'] });

    await fireEvent.press(screen.getByTestId('shifts-right-overflow'));
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 144, animated: true });

    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 200, y: 0 } } });
    expect(screen.getByRole('button', { name: 'Scroll tabs left' })).toBeTruthy();
    expect(screen.getByTestId('shifts-right-overflow')).toBeTruthy();

    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 400, y: 0 } } });
    expect(screen.getByTestId('shifts-left-overflow')).toBeTruthy();
    expect(screen.queryByTestId('shifts-right-overflow')).toBeNull();

    scrollTo.mockRestore();
  });

  it('shows no chevrons when every tab fits', async () => {
    await render(<TabBar tabs={TABS.slice(0, 2)} activeKey="today" onChange={jest.fn()} variant="pills" />);
    const scrollView = screen.getByTestId('tab-bar-scroll-view');

    await fireEvent(scrollView, 'layout', { nativeEvent: { layout: { width: 400 } } });
    await fireEvent(scrollView, 'contentSizeChange', 220, 40);

    expect(screen.queryByTestId('tab-bar-left-overflow')).toBeNull();
    expect(screen.queryByTestId('tab-bar-right-overflow')).toBeNull();
  });

  it('opens scrolled to a selected tab further along (a page opened on its Trades view)', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    await render(<TabBar tabs={TABS} activeKey="trades" onChange={jest.fn()} variant="pills" />);
    await measure();

    // Centred: 400 - (200 - 90) / 2.
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 345, animated: false });
    scrollTo.mockRestore();
  });
});

// Hand-made tab rows are how the Shifts strip ended up without chevrons while SharedTabs had them. Tab bars come from
// @resgrid/ui; the rows listed here are not page tabs and never run off-screen.
describe('tab bar source rule', () => {
  const PACKAGES = path.resolve(__dirname, '../../..');
  const ROOTS = [PACKAGES, path.resolve(PACKAGES, '../apps/omni')];
  const SKIP = new Set(['node_modules', '__tests__', 'dist', 'ios', 'android', 'ui', '.metro-cache', '.expo']);

  // File → why its row is not a page tab bar.
  const ALLOWED = new Map([
    ['packages/features/src/contacts/screens/contact-detail.tsx', 'two fixed tabs on a detail screen'],
    ['packages/features/src/status/components/status-picker.tsx', 'the Status/Staffing switch inside the status sheet'],
    ['packages/features/src/status/components/status-destination-list.tsx', 'fixed destination tabs inside the status sheet'],
    ['packages/features/src/dashboard/screens/configure-dashboard.tsx', 'a widget picker whose chips show on-board state'],
    ['packages/features/src/dispatch-console/components/activity-panel.tsx', 'console panel tabs that wrap rather than scroll'],
    ['packages/features/src/shifts/screens/shifts.tsx', 'the two Sign up filter chips inside a Shifts view'],
    ['packages/features/src/shifts/components/shift-lists.tsx', 'the two Trades filter chips inside a Shifts view'],
  ]);

  const TAB_ROLE = /accessibilityRole=["{']+tab(list)?["}']/;
  const REPO = path.resolve(PACKAGES, '..');

  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? (SKIP.has(entry.name) ? [] : walk(path.join(dir, entry.name))) : /\.tsx$/.test(entry.name) ? [path.join(dir, entry.name)] : []));

  it('builds tab rows with TabBar or SharedTabs, not by hand', () => {
    const offenders = ROOTS.flatMap(walk).flatMap((absolute) => {
      const file = path.relative(REPO, absolute).replace(/\\/g, '/');

      return !ALLOWED.has(file) && TAB_ROLE.test(fs.readFileSync(absolute, 'utf8')) ? [file] : [];
    });

    expect(offenders).toEqual([]);
  });

  it('lists only files that still need it', () => {
    const stale = [...ALLOWED.keys()].filter((file) => {
      const absolute = path.resolve(REPO, file);

      return !fs.existsSync(absolute) || !TAB_ROLE.test(fs.readFileSync(absolute, 'utf8'));
    });

    expect(stale).toEqual([]);
  });
});
