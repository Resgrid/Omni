import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Pressable as RNPressable, ScrollView, StyleSheet, Text as RNText } from 'react-native';
import type { JsonElement, JsonNode } from 'test-renderer';

import { FocusAwareStatusBar } from '../focus-aware-status-bar';
import * as ui from '../index';
import { SharedTabs, type TabItem } from '../shared-tabs';
import { lightTokens } from '../theme/tokens';

const { Button, ButtonSpinner, ButtonText, Pressable, Text } = ui;

describe('@resgrid/ui barrel (Responder semantics)', () => {
  it('exports the gluestack Pressable, not React Native’s', () => {
    expect(Pressable).not.toBe(RNPressable);
  });

  it('exports the gluestack Text, not React Native’s', () => {
    expect(Text).not.toBe(RNText);
  });

  it('exposes the overlay, toast, layout and theme APIs', () => {
    expect(ui.NativeModal).toBeDefined();
    expect(ui.CustomBottomSheet).toBeDefined();
    expect(ui.SideDrawer).toBeDefined();
    expect(ui.showToast).toBeDefined();
    expect(ui.ToastContainer).toBeDefined();
    expect(ui.useFormFactor).toBeDefined();
    expect(ui.useThemeColors).toBeDefined();
    expect(ui.HtmlRenderer).toBeDefined();
    expect(ui.sanitizeHtmlContent).toBeDefined();
  });
});

describe('Button', () => {
  it('calls onPress when enabled', async () => {
    const onPress = jest.fn();
    await render(
      <Button onPress={onPress} testID="save">
        <ButtonText>Save</ButtonText>
      </Button>
    );

    await fireEvent.press(screen.getByTestId('save'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('does not call onPress and reports the disabled state when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <Button onPress={onPress} isDisabled testID="save">
        <ButtonText>Save</ButtonText>
      </Button>
    );

    await fireEvent.press(screen.getByTestId('save'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('save').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('renders a spinner for the loading state', async () => {
    await render(
      <Button testID="save" isDisabled>
        <ButtonSpinner testID="save-spinner" />
        <ButtonText>Saving</ButtonText>
      </Button>
    );

    expect(screen.getByTestId('save-spinner')).toBeTruthy();
  });

  it('is exposed to screen readers as a button with its label', async () => {
    await render(
      <Button testID="save" accessibilityLabel="Save call">
        <ButtonText>Save</ButtonText>
      </Button>
    );

    expect(screen.getByRole('button', { name: 'Save call' })).toBeTruthy();
  });
});

/** The rendered subtree whose root carries `testID`. */
const findJsonNode = (node: JsonElement | null, testID: string): JsonElement | null => {
  if (!node) return null;

  if (node.props.testID === testID) return node;

  for (const child of node.children) {
    const found = child instanceof Object ? findJsonNode(child, testID) : null;

    if (found) return found;
  }

  return null;
};

/** Every element in the subtree that still carries a className (testID or type, for the failure message). */
const classedNodes = (node: JsonElement | null): string[] => {
  if (!node) return [];

  const own = node.props.className === undefined ? [] : [String(node.props.testID ?? node.type)];

  return [...own, ...node.children.flatMap((child: JsonNode) => (child instanceof Object ? classedNodes(child) : []))];
};

describe('SharedTabs (Responder + Unit)', () => {
  const tabs: TabItem[] = [
    { key: 'details', title: 'call_detail.details', content: <RNText>Details body</RNText> },
    { key: 'timeline', title: 'call_detail.timeline', content: <RNText>Timeline body</RNText> },
    { key: 'command', title: 'incident_command.tab_title', content: <RNText>Command body</RNText>, badge: 5 },
    { key: 'checkin', title: 'check_in.tab_title', content: <RNText>Check-in body</RNText>, badge: 120, badgeVariant: 'warning' },
  ];

  it('renders translated titles on one line and the first tab content', async () => {
    await render(<SharedTabs tabs={tabs} />);

    expect(screen.getByText('call_detail.details').props.numberOfLines).toBe(1);
    expect(screen.getByText('Details body')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('shared-tab-details').props.style)).toMatchObject({ flexShrink: 0 });
  });

  it('sizes to its content unless the caller asks it to fill', async () => {
    await render(<SharedTabs tabs={tabs} />);
    expect(String(screen.getByTestId('shared-tabs').props.className ?? '')).not.toMatch(/\bflex-1\b/);

    await render(<SharedTabs tabs={tabs} className="flex-1" />);
    expect(screen.getByTestId('shared-tabs').props.className).toContain('flex-1');
    // The root and the content wrapper may take classes; the bar inside never does (checked per variant below).
    expect(classedNodes(findJsonNode(screen.toJSON(), 'shared-tabs'))).toContain('shared-tabs');
  });

  it('switches content on press and reports the index', async () => {
    const onChange = jest.fn();
    await render(<SharedTabs tabs={tabs} onChange={onChange} />);

    await fireEvent.press(screen.getByText('call_detail.timeline'));

    expect(onChange).toHaveBeenCalledWith(1);
    expect(screen.getByText('Timeline body')).toBeTruthy();
  });

  it('keeps each instance independent (no global tab store)', async () => {
    await render(
      <>
        <SharedTabs tabs={tabs.slice(0, 2)} onChange={jest.fn()} />
        <SharedTabs
          tabs={[
            { key: 'a', title: 'A', content: <RNText>A body</RNText> },
            { key: 'b', title: 'B', content: <RNText>B body</RNText> },
          ]}
          onChange={jest.fn()}
        />
      </>
    );

    await fireEvent.press(screen.getByText('call_detail.timeline'));

    expect(screen.getByText('Timeline body')).toBeTruthy();
    expect(screen.getByText('A body')).toBeTruthy();
    expect(screen.queryByText('B body')).toBeNull();
  });

  it('keeps visited tabs mounted but hidden by default', async () => {
    await render(<SharedTabs tabs={tabs} />);

    await fireEvent.press(screen.getByText('call_detail.timeline'));

    expect(StyleSheet.flatten(screen.getByTestId('shared-tab-content-details', { includeHiddenElements: true }).props.style)).toMatchObject({ display: 'none' });
    expect(screen.queryByTestId('shared-tab-content-command', { includeHiddenElements: true })).toBeNull();
  });

  it('renders only the active tab when keepMounted is false', async () => {
    await render(<SharedTabs tabs={tabs} keepMounted={false} initialIndex={1} />);

    expect(screen.getByText('Timeline body')).toBeTruthy();
    expect(screen.queryByText('Details body', { includeHiddenElements: true })).toBeNull();
  });

  it('follows a controlled activeIndex', async () => {
    const { rerender } = await render(<SharedTabs tabs={tabs} activeIndex={0} />);
    await rerender(<SharedTabs tabs={tabs} activeIndex={2} />);

    expect(screen.getByText('Command body')).toBeTruthy();
  });

  it('marks tabs with the tab role and the selected state', async () => {
    await render(<SharedTabs tabs={tabs} />);

    expect(screen.getByTestId('shared-tab-details').props.accessibilityRole).toBe('tab');
    expect(screen.getByTestId('shared-tab-details').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('shared-tab-timeline').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('caps badges at 99+ and colours them by variant', async () => {
    await render(<SharedTabs tabs={tabs} />);

    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('99+')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('shared-tab-checkin-badge').props.style)).toMatchObject({ backgroundColor: lightTokens['warning-500'] });
    expect(StyleSheet.flatten(screen.getByTestId('shared-tab-command-badge').props.style)).toMatchObject({ backgroundColor: lightTokens['error-500'] });
  });

  // Responder's Status/Staffing bar came up on Android devices, from a cold start, collapsed to its padding with the labels
  // about 1 px tall: the class layer resolves a label's line height at run time from CSS variables, and the active tab
  // adds and drops variable-setting classes. The bar is plain styles with fixed metrics instead (BAR LAYOUT).
  // Page pills keep one readable size (text-sm) in both orientations; the other bars start at text-xs on a portrait phone.
  it.each([
    ['segmented', 12, 16],
    ['pills', 14, 20],
    ['default', 12, 16],
    ['underlined', 12, 16],
  ] as const)('lays out the %s bar from plain styles: no classes, a fixed line height and a height floor', async (variant, fontSize, lineHeight) => {
    await render(<SharedTabs tabs={tabs} variant={variant} scrollable={false} size="md" />);

    const bar = screen.getByTestId('shared-tabs-bar');
    const barTree = findJsonNode(screen.toJSON(), 'shared-tabs-bar');
    expect(barTree).not.toBeNull();
    expect(classedNodes(barTree)).toEqual([]);
    expect(StyleSheet.flatten(bar.props.style)).toMatchObject({ flexDirection: 'row', flexShrink: 0 });

    for (const tab of tabs) {
      const label = StyleSheet.flatten(screen.getByTestId(`shared-tab-${tab.key}-label`).props.style);
      const button = StyleSheet.flatten(screen.getByTestId(`shared-tab-${tab.key}`).props.style);
      expect(label).toMatchObject({ fontSize, lineHeight });
      expect(button).toMatchObject({ flexGrow: 1, flexBasis: 0 });
      expect(button.minHeight).toBeGreaterThanOrEqual(lineHeight + Number(button.paddingVertical) * 2);
    }
  });

  it('keeps the label metrics and only changes colours and weight when the selection moves', async () => {
    const { rerender } = await render(<SharedTabs tabs={tabs} activeIndex={0} variant="segmented" scrollable={false} />);
    const before = StyleSheet.flatten(screen.getByTestId('shared-tab-timeline-label').props.style);
    const beforeTab = StyleSheet.flatten(screen.getByTestId('shared-tab-timeline').props.style);

    await rerender(<SharedTabs tabs={tabs} activeIndex={1} variant="segmented" scrollable={false} />);

    const after = StyleSheet.flatten(screen.getByTestId('shared-tab-timeline-label').props.style);
    const afterTab = StyleSheet.flatten(screen.getByTestId('shared-tab-timeline').props.style);
    expect({ fontSize: after.fontSize, lineHeight: after.lineHeight }).toEqual({ fontSize: before.fontSize, lineHeight: before.lineHeight });
    expect({ minHeight: afterTab.minHeight, paddingVertical: afterTab.paddingVertical }).toEqual({ minHeight: beforeTab.minHeight, paddingVertical: beforeTab.paddingVertical });
    expect(after).toMatchObject({ fontWeight: '600', color: lightTokens['typography-0'] });
    expect(before).toMatchObject({ fontWeight: '500', color: lightTokens['typography-600'] });
    expect(afterTab).toMatchObject({ backgroundColor: lightTokens['primary-600'] });
  });

  it('takes the caller’s tab and bar styles (touch target, margins)', async () => {
    await render(<SharedTabs tabs={tabs} variant="segmented" scrollable={false} tabStyle={{ minHeight: 44 }} tabsContainerStyle={{ marginHorizontal: 16 }} />);

    expect(StyleSheet.flatten(screen.getByTestId('shared-tab-details').props.style)).toMatchObject({ minHeight: 44 });
    expect(StyleSheet.flatten(screen.getByTestId('shared-tabs-bar').props.style)).toMatchObject({ marginHorizontal: 16 });
  });

  it('shows overflow indicators based on the horizontal scroll position', async () => {
    await render(<SharedTabs tabs={tabs} />);
    const scrollView = screen.getByTestId('shared-tabs-bar-scroll-view');

    await fireEvent(scrollView, 'layout', { nativeEvent: { layout: { width: 200 } } });
    await fireEvent(scrollView, 'contentSizeChange', 400, 40);

    expect(screen.queryByTestId('shared-tabs-bar-left-overflow')).toBeNull();
    expect(screen.getByTestId('shared-tabs-bar-right-overflow')).toBeTruthy();

    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 200, y: 0 } } });

    expect(screen.getByTestId('shared-tabs-bar-left-overflow')).toBeTruthy();
    expect(screen.queryByTestId('shared-tabs-bar-right-overflow')).toBeNull();
  });

  it('pages the bar towards the hidden tabs when a chevron is pressed (they only hinted before and ignored taps)', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
    await render(<SharedTabs tabs={tabs} />);
    const scrollView = screen.getByTestId('shared-tabs-bar-scroll-view');

    await fireEvent(scrollView, 'layout', { nativeEvent: { layout: { width: 200 } } });
    await fireEvent(scrollView, 'contentSizeChange', 500, 40);

    const right = screen.getByRole('button', { name: 'Scroll tabs right' });
    await fireEvent.press(right);
    // One bar width less both 28px chevrons, so the tab cut off at the edge comes fully into view.
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 144, animated: true });

    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 250, y: 0 } } });
    await fireEvent.press(screen.getByTestId('shared-tabs-bar-right-overflow'));
    // Never past the end of the row.
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 300, animated: true });

    await fireEvent.press(screen.getByRole('button', { name: 'Scroll tabs left' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 106, animated: true });

    await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 60, y: 0 } } });
    await fireEvent.press(screen.getByTestId('shared-tabs-bar-left-overflow'));
    // Never before the start.
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: true });

    scrollTo.mockRestore();
  });

  it('can hide the overflow indicators', async () => {
    await render(<SharedTabs tabs={tabs} showOverflowIndicators={false} />);
    const scrollView = screen.getByTestId('shared-tabs-bar-scroll-view');

    await fireEvent(scrollView, 'layout', { nativeEvent: { layout: { width: 200 } } });
    await fireEvent(scrollView, 'contentSizeChange', 400, 40);

    expect(screen.queryByTestId('shared-tabs-bar-right-overflow')).toBeNull();
  });
});

describe('FocusAwareStatusBar', () => {
  it('renders the system bars while focused on native', async () => {
    await expect(render(<FocusAwareStatusBar hidden />)).resolves.toBeDefined();
  });
});
