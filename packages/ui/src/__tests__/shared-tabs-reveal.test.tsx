import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { ScrollView, Text } from 'react-native';

import { SharedTabs, type TabItem } from '../shared-tabs';

const KEYS = ['info', 'protocols', 'dispatched', 'activity', 'command', 'history'];
const tabs: TabItem[] = KEYS.map((key) => ({ key, title: key, content: <Text>{`${key} panel`}</Text> }));

// Each tab 90 wide at 100 spacing, a 200-wide bar over a 600-wide row: tabs 0–1 are in view at the start.
const measure = async () => {
  for (const [index, key] of KEYS.entries()) {
    await fireEvent(screen.getByTestId(`shared-tab-${key}`), 'layout', { nativeEvent: { layout: { x: index * 100, y: 0, width: 90, height: 40 } } });
  }

  const scrollView = screen.getByTestId('shared-tabs-scroll-view');

  await fireEvent(scrollView, 'layout', { nativeEvent: { layout: { width: 200 } } });
  await fireEvent(scrollView, 'contentSizeChange', 600, 40);

  return scrollView;
};

describe('SharedTabs brings the selected tab into view', () => {
  let scrollTo: jest.SpyInstance;

  beforeEach(() => {
    scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
  });

  afterEach(() => {
    scrollTo.mockRestore();
  });

  it('opens scrolled to a selected tab further along, as when Back returns to a call on its Command tab', async () => {
    await render(<SharedTabs tabs={tabs} activeIndex={4} />);
    await measure();

    // Centred: 400 - (200 - 90) / 2.
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 345, animated: false });
  });

  it('leaves the bar where it is when the selected tab is already in view, and keeps a bar the user scrolled', async () => {
    await render(<SharedTabs tabs={tabs} activeIndex={0} />);
    const scrollView = await measure();
    expect(scrollTo).not.toHaveBeenCalled();

    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 300, y: 0 } } });
    await fireEvent(scrollView, 'contentSizeChange', 600, 40);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls (animated, never past the end) to a tab selected without a press', async () => {
    const view = await render(<SharedTabs tabs={tabs} activeIndex={0} />);
    await measure();

    await view.rerender(<SharedTabs tabs={tabs} activeIndex={5} />);

    expect(scrollTo).toHaveBeenLastCalledWith({ x: 400, animated: true });
  });
});
