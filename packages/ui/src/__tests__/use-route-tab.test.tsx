import { act, renderHook } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import fs from 'fs';
import path from 'path';

import { useRouteTab } from '../use-route-tab';

jest.mock('expo-router', () => ({ router: { setParams: jest.fn() }, useLocalSearchParams: jest.fn(() => ({})) }));

const TABS = [{ key: 'info' }, { key: 'command' }, { key: 'history' }];

describe('useRouteTab', () => {
  beforeEach(() => {
    jest.mocked(useLocalSearchParams).mockReturnValue({});
  });

  it('starts on the first tab and records a selection in the route params', async () => {
    const { result } = await renderHook(() => useRouteTab(TABS));
    expect(result.current.activeIndex).toBe(0);

    await act(async () => result.current.selectIndex(1));

    expect(result.current.activeIndex).toBe(1);
    expect(result.current.activeKey).toBe('command');
    expect(router.setParams).toHaveBeenCalledWith({ tab: 'command' });
  });

  it('remounts on the tab its route recorded, as after Back from a chat channel opened on Command', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ tab: 'command' });

    const { result } = await renderHook(() => useRouteTab(TABS));

    expect(result.current.activeIndex).toBe(1);
  });

  it('shows the first tab while the recorded one is still loading, then moves to it', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ tab: 'command' });

    const { result, rerender } = await renderHook(({ tabs }: { tabs: { key: string }[] }) => useRouteTab(tabs), { initialProps: { tabs: [{ key: 'info' }] } });
    expect(result.current.activeIndex).toBe(0);

    await rerender({ tabs: TABS });

    expect(result.current.activeIndex).toBe(1);
  });

  it('follows the route when its tab changes or goes, as a link to the same screen without a tab', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ tab: 'history' });
    const { result, rerender } = await renderHook(() => useRouteTab(TABS));
    expect(result.current.activeIndex).toBe(2);

    jest.mocked(useLocalSearchParams).mockReturnValue({ tab: 'command' });
    await rerender({});
    expect(result.current.activeKey).toBe('command');

    jest.mocked(useLocalSearchParams).mockReturnValue({});
    await rerender({});
    expect(result.current.activeKey).toBeUndefined();
    expect(result.current.activeIndex).toBe(0);
  });

  it('leaves the route alone when the selected tab is pressed again, and uses the param it is given', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ section: 'history' });

    const { result } = await renderHook(() => useRouteTab(TABS, 'section'));
    expect(result.current.activeIndex).toBe(2);

    await act(async () => result.current.selectIndex(2));
    expect(router.setParams).not.toHaveBeenCalled();

    await act(async () => result.current.selectIndex(0));
    expect(router.setParams).toHaveBeenCalledWith({ section: 'info' });
  });
});

// A screen's tab kept only in component state comes back on the first tab whenever the screen is rebuilt (Back to a
// screen the navigator let go of, a web reload, a link). Every screen that renders SharedTabs keeps its selection in the route.
describe('tabbed screen source rule', () => {
  const ROOTS = [path.resolve(__dirname, '../../../features/src'), path.resolve(__dirname, '../../../app-shell/src')];

  const walk = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) => (entry.isDirectory() ? (entry.name === '__tests__' ? [] : walk(path.join(dir, entry.name))) : /\.tsx$/.test(entry.name) ? [path.join(dir, entry.name)] : []));

  it('keeps the selected tab of every tabbed screen in the route params', () => {
    const offenders = ROOTS.flatMap(walk).filter((file) => {
      const text = fs.readFileSync(file, 'utf8');

      return file.includes(`${path.sep}screens${path.sep}`) && /<SharedTabs\b/.test(text) && !text.includes('useRouteTab(');
    });

    expect(offenders.map((file) => path.relative(path.resolve(__dirname, '../../..'), file))).toEqual([]);
  });
});
