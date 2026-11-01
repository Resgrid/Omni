import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Pressable as RNPressable, StyleSheet, Text as RNText } from 'react-native';

import { FocusAwareStatusBar } from '../focus-aware-status-bar';
import * as ui from '../index';
import { SharedTabs, type TabItem } from '../shared-tabs';

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
  it('calls onPress when enabled', () => {
    const onPress = jest.fn();
    render(
      <Button onPress={onPress} testID="save">
        <ButtonText>Save</ButtonText>
      </Button>
    );

    fireEvent.press(screen.getByTestId('save'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('does not call onPress and reports the disabled state when disabled', () => {
    const onPress = jest.fn();
    render(
      <Button onPress={onPress} isDisabled testID="save">
        <ButtonText>Save</ButtonText>
      </Button>
    );

    fireEvent.press(screen.getByTestId('save'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('save').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('renders a spinner for the loading state', () => {
    render(
      <Button testID="save" isDisabled>
        <ButtonSpinner testID="save-spinner" />
        <ButtonText>Saving</ButtonText>
      </Button>
    );

    expect(screen.getByTestId('save-spinner')).toBeTruthy();
  });

  it('is exposed to screen readers as a button with its label', () => {
    render(
      <Button testID="save" accessibilityLabel="Save call">
        <ButtonText>Save</ButtonText>
      </Button>
    );

    expect(screen.getByRole('button', { name: 'Save call' })).toBeTruthy();
  });
});

describe('SharedTabs (Responder + Unit)', () => {
  const tabs: TabItem[] = [
    { key: 'details', title: 'call_detail.details', content: <RNText>Details body</RNText> },
    { key: 'timeline', title: 'call_detail.timeline', content: <RNText>Timeline body</RNText> },
    { key: 'command', title: 'incident_command.tab_title', content: <RNText>Command body</RNText>, badge: 5 },
    { key: 'checkin', title: 'check_in.tab_title', content: <RNText>Check-in body</RNText>, badge: 120, badgeVariant: 'warning' },
  ];

  it('renders translated titles on one line and the first tab content', () => {
    render(<SharedTabs tabs={tabs} />);

    expect(screen.getByText('call_detail.details').props.numberOfLines).toBe(1);
    expect(screen.getByText('Details body')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('shared-tab-details').props.style)).toMatchObject({ flexShrink: 0 });
  });

  it('switches content on press and reports the index', () => {
    const onChange = jest.fn();
    render(<SharedTabs tabs={tabs} onChange={onChange} />);

    fireEvent.press(screen.getByText('call_detail.timeline'));

    expect(onChange).toHaveBeenCalledWith(1);
    expect(screen.getByText('Timeline body')).toBeTruthy();
  });

  it('keeps each instance independent (no global tab store)', () => {
    render(
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

    fireEvent.press(screen.getByText('call_detail.timeline'));

    expect(screen.getByText('Timeline body')).toBeTruthy();
    expect(screen.getByText('A body')).toBeTruthy();
    expect(screen.queryByText('B body')).toBeNull();
  });

  it('keeps visited tabs mounted but hidden by default', () => {
    render(<SharedTabs tabs={tabs} />);

    fireEvent.press(screen.getByText('call_detail.timeline'));

    expect(StyleSheet.flatten(screen.getByTestId('shared-tab-content-details', { includeHiddenElements: true }).props.style)).toMatchObject({ display: 'none' });
    expect(screen.queryByTestId('shared-tab-content-command', { includeHiddenElements: true })).toBeNull();
  });

  it('renders only the active tab when keepMounted is false', () => {
    render(<SharedTabs tabs={tabs} keepMounted={false} initialIndex={1} />);

    expect(screen.getByText('Timeline body')).toBeTruthy();
    expect(screen.queryByText('Details body', { includeHiddenElements: true })).toBeNull();
  });

  it('follows a controlled activeIndex', () => {
    const { rerender } = render(<SharedTabs tabs={tabs} activeIndex={0} />);
    rerender(<SharedTabs tabs={tabs} activeIndex={2} />);

    expect(screen.getByText('Command body')).toBeTruthy();
  });

  it('marks tabs with the tab role and the selected state', () => {
    render(<SharedTabs tabs={tabs} />);

    expect(screen.getByTestId('shared-tab-details').props.accessibilityRole).toBe('tab');
    expect(screen.getByTestId('shared-tab-details').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('shared-tab-timeline').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('caps badges at 99+ and colours them by variant', () => {
    render(<SharedTabs tabs={tabs} />);

    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('99+')).toBeTruthy();
    expect(screen.getByTestId('shared-tab-checkin-badge').props.className).toContain('bg-warning-500');
    expect(screen.getByTestId('shared-tab-command-badge').props.className).toContain('bg-error-500');
  });

  it('shows overflow indicators based on the horizontal scroll position', () => {
    render(<SharedTabs tabs={tabs} />);
    const scrollView = screen.getByTestId('shared-tabs-scroll-view');

    fireEvent(scrollView, 'layout', { nativeEvent: { layout: { width: 200 } } });
    fireEvent(scrollView, 'contentSizeChange', 400, 40);

    expect(screen.queryByTestId('shared-tabs-left-overflow')).toBeNull();
    expect(screen.getByTestId('shared-tabs-right-overflow')).toBeTruthy();

    fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 200, y: 0 } } });

    expect(screen.getByTestId('shared-tabs-left-overflow')).toBeTruthy();
    expect(screen.queryByTestId('shared-tabs-right-overflow')).toBeNull();
  });

  it('can hide the overflow indicators', () => {
    render(<SharedTabs tabs={tabs} showOverflowIndicators={false} />);
    const scrollView = screen.getByTestId('shared-tabs-scroll-view');

    fireEvent(scrollView, 'layout', { nativeEvent: { layout: { width: 200 } } });
    fireEvent(scrollView, 'contentSizeChange', 400, 40);

    expect(screen.queryByTestId('shared-tabs-right-overflow')).toBeNull();
  });
});

describe('FocusAwareStatusBar', () => {
  it('renders the system bars while focused on native', () => {
    expect(() => render(<FocusAwareStatusBar hidden />)).not.toThrow();
  });
});
